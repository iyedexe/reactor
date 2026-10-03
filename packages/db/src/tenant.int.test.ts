import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "./generated/prisma/client.ts";
import { disconnectPrisma, prisma } from "./client.ts";
import { forTenant, GLOBAL_MODELS, TENANT_MODELS, TenantViolationError, type TenantDb } from "./tenant.ts";
import { createTenantFixture, resetDatabase, type TenantFixture } from "./testing.ts";

const lower = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
const tenantModels = Object.keys(TENANT_MODELS) as (keyof typeof TENANT_MODELS)[];

let A: TenantFixture;
let B: TenantFixture;
let dbA: TenantDb;

// Untyped access to iterate over every delegate generically.
const anyDb = (db: unknown, model: string) => (db as Record<string, any>)[lower(model)];

beforeAll(async () => {
  await resetDatabase();
  A = await createTenantFixture("a");
  B = await createTenantFixture("b");
  dbA = forTenant({ organizationId: A.organizationId, userId: A.userId, role: "owner" });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe("model registry", () => {
  it("classifies every Prisma model as tenant-owned or global, never both", () => {
    const all = new Set(Object.values(Prisma.ModelName));
    const tenant = new Set<string>(tenantModels);
    const global = new Set<string>(GLOBAL_MODELS);
    for (const m of tenant) expect(global.has(m), m).toBe(false);
    expect(new Set([...tenant, ...global])).toEqual(all);
  });

  it("the fixture creates a row in every tenant model", () => {
    for (const m of tenantModels) expect(A.ids[m], m).toBeTruthy();
  });
});

describe.each(tenantModels)("tenant isolation: %s", (model) => {
  const key = TENANT_MODELS[model].key;
  const noCreateDelete = "noCreateDelete" in TENANT_MODELS[model];

  it("findMany only returns own rows", async () => {
    const rows: Record<string, unknown>[] = await anyDb(dbA, model).findMany();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r[key]).toBe(A.organizationId);
    expect(rows.map((r) => r.id)).not.toContain(B.ids[model]);
  });

  it("findUnique / findFirst cannot read another tenant's row by id", async () => {
    expect(await anyDb(dbA, model).findUnique({ where: { id: B.ids[model] } })).toBeNull();
    expect(await anyDb(dbA, model).findFirst({ where: { id: B.ids[model] } })).toBeNull();
    expect(await anyDb(dbA, model).findUnique({ where: { id: A.ids[model] } })).not.toBeNull();
  });

  it("count and aggregate ignore other tenants", async () => {
    const own = await anyDb(prisma(), model).count({ where: { [key]: A.organizationId } });
    expect(await anyDb(dbA, model).count()).toBe(own);
  });

  it("cannot update another tenant's row", async () => {
    const field = model === "Organization" ? "name" : "id";
    const data = field === "name" ? { name: "hacked" } : { id: B.ids[model] };
    await expect(anyDb(dbA, model).update({ where: { id: B.ids[model] }, data })).rejects.toThrow();
    const res = await anyDb(dbA, model).updateMany({ where: { id: B.ids[model] }, data: field === "name" ? data : {} });
    expect(res.count).toBe(0);
  });

  it("cannot delete another tenant's row", async () => {
    await expect(anyDb(dbA, model).delete({ where: { id: B.ids[model] } })).rejects.toThrow();
    if (noCreateDelete) {
      await expect(anyDb(dbA, model).deleteMany({ where: { id: B.ids[model] } })).rejects.toThrow(TenantViolationError);
    } else {
      expect((await anyDb(dbA, model).deleteMany({ where: { id: B.ids[model] } })).count).toBe(0);
    }
    expect(await anyDb(prisma(), model).findUnique({ where: { id: B.ids[model] } })).not.toBeNull();
  });
});

describe("tenant isolation: writes", () => {
  it("rejects creating a row for another organization", async () => {
    await expect(
      dbA.privateFeedback.create({ data: { organizationId: B.organizationId, locationId: A.ids.Location!, message: "x" } }),
    ).rejects.toThrow(TenantViolationError);
  });

  it("rejects foreign keys pointing to another tenant", async () => {
    await expect(
      dbA.privateFeedback.create({ data: { organizationId: A.organizationId, locationId: B.ids.Location!, message: "x" } }),
    ).rejects.toThrow(TenantViolationError);
    await expect(
      dbA.contact.update({ where: { id: A.ids.Contact! }, data: { locationId: B.ids.Location! } }),
    ).rejects.toThrow(TenantViolationError);
    await expect(
      dbA.reviewReply.create({ data: { organizationId: A.organizationId, reviewId: B.ids.Review!, body: "x", status: "DRAFT", origin: "AI" } }),
    ).rejects.toThrow(TenantViolationError);
  });

  it("rejects moving a row to another organization", async () => {
    await expect(
      dbA.contact.update({ where: { id: A.ids.Contact! }, data: { organizationId: B.organizationId } }),
    ).rejects.toThrow(TenantViolationError);
  });

  it("rejects nested relation writes", async () => {
    await expect(
      dbA.review.update({ where: { id: A.ids.Review! }, data: { location: { connect: { id: B.ids.Location! } } } as never }),
    ).rejects.toThrow(TenantViolationError);
  });

  it("rejects upserts that would land in another tenant", async () => {
    await expect(
      dbA.replySettings.upsert({
        where: { locationId: B.ids.Location! },
        create: { organizationId: A.organizationId, locationId: B.ids.Location! },
        update: { signature: "hacked" },
      }),
    ).rejects.toThrow(TenantViolationError);
    const settingsB = await prisma().replySettings.findUnique({ where: { locationId: B.ids.Location! } });
    expect(settingsB?.signature).toBeNull();
  });

  it("allows normal writes within the tenant", async () => {
    const fb = await dbA.privateFeedback.create({
      data: { organizationId: A.organizationId, locationId: A.ids.Location!, message: "Super accueil" },
    });
    expect(fb.organizationId).toBe(A.organizationId);
    await dbA.privateFeedback.update({ where: { id: fb.id }, data: { status: "READ" } });
    await dbA.privateFeedback.delete({ where: { id: fb.id } });
  });

  it("stands and subscriptions cannot be created or deleted by tenants", async () => {
    await expect(
      dbA.stand.create({ data: { code: "zzz", organizationId: A.organizationId } }),
    ).rejects.toThrow(TenantViolationError);
    await expect(
      dbA.subscription.create({ data: { organizationId: A.organizationId, plan: "PRO", status: "ACTIVE" } }),
    ).rejects.toThrow(TenantViolationError);
  });
});

describe("tenant isolation: other access paths", () => {
  it("relation includes do not leak other tenants' rows", async () => {
    const locs = await dbA.location.findMany({ include: { reviews: true, contacts: true, stands: true } });
    for (const l of locs) {
      for (const r of [...l.reviews, ...l.contacts, ...l.stands]) expect(r.organizationId).toBe(A.organizationId);
    }
  });

  it("interactive transactions stay scoped", async () => {
    const rows = await dbA.$transaction(async (tx) => tx.review.findMany());
    expect(rows.every((r) => r.organizationId === A.organizationId)).toBe(true);
    expect(rows.map((r) => r.id)).not.toContain(B.ids.Review);
  });

  it("global tables are unreachable", () => {
    expect(() => (dbA as unknown as Record<string, unknown>).user).toThrow(TenantViolationError);
    expect(() => (dbA as unknown as Record<string, unknown>).mockGbpReview).toThrow(TenantViolationError);
  });

  it("raw SQL is unavailable", () => {
    expect(() => (dbA as unknown as { $queryRawUnsafe: (q: string) => unknown }).$queryRawUnsafe("select 1")).toThrow(
      TenantViolationError,
    );
  });

  it("shared (organizationId = null) templates are readable but not writable", async () => {
    const shared = await prisma().messageTemplate.create({
      data: { organizationId: null, channel: "SMS", kind: "REQUEST", name: "default", body: "Bonjour {{prenom}}" },
    });
    const visible = await dbA.messageTemplate.findMany();
    expect(visible.map((t) => t.id)).toContain(shared.id);
    expect(visible.map((t) => t.id)).not.toContain(B.ids.MessageTemplate);
    await expect(dbA.messageTemplate.update({ where: { id: shared.id }, data: { body: "hacked" } })).rejects.toThrow();
  });

  it("the tenant id is required", () => {
    expect(() => forTenant({ organizationId: "" })).toThrow(TenantViolationError);
  });
});
