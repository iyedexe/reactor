from datetime import datetime
import asyncio
import random
import datetime;
 
def generate_random_market_data():
    ct = datetime.datetime.now()
    ts = ct.timestamp()
    bid = 10+40*random.random()
    ask = bid + (50-bid)*random.random()
    return bid, ask, ts    

async def produce(reader, writer):
    print('[PRODUCER] Open the connection')
    run=True
    interval=5

    while run:
        bid, ask, timestamp = generate_random_market_data()
        for way in [0,1]:
            message = [bid if way==0 else ask, way, timestamp]
            message_str = "["+";".join([str(elem) for elem in message])+"]"
            writer.write(message_str.encode())
            await writer.drain()
        print(f'[PRODUCER] bid={bid}, ask={ask}, timestamp={timestamp}')
        await asyncio.sleep(interval)

    print('[PRODUCER] Close the connection')
    writer.close()
    await writer.wait_closed()


async def main():
    server = await asyncio.start_server(
        produce, 'localhost', 8888)

    addrs = ', '.join(str(sock.getsockname()) for sock in server.sockets)
    print(f'Serving on {addrs}')

    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    asyncio.run(main())
