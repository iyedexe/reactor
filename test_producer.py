import asyncio
import pytest

from reactor.producer import DataEncoder

def test_encode():
        assert True

def test_decode():
        assert True

# @pytest.mark.asyncio
# async def test_produce():
#     writer = MockWriter()

#     await produce_frame(writer)
#     assert len(writer.data) == 2
#     assert len(writer.data[0].decode().split(";")) == 3
#     assert len(writer.data[1].decode().split(";")) == 3

if __name__ == "__main__":
    test_decode()
    test_encode()
    # asyncio.run(test_produce())
