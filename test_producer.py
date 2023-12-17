import asyncio
import pytest

from producer import generate_random_market_data
from producer import produce_frame

def test_market_data():
    for i in range(30):
        bid, ask, timestamp = generate_random_market_data()
        assert bid >= 10
        assert ask >= bid
        assert 50 >= bid

class MockWriter:
    def __init__(self):
        self.data = []

    def write(self, message):
        self.data.append(message) 
    
    async def drain(self):
        return True

    def close(self):
        pass

@pytest.mark.asyncio
async def test_produce():
    writer = MockWriter()

    await produce_frame(writer)
    assert len(writer.data) == 2
    assert len(writer.data[0].decode().split(";")) == 3
    assert len(writer.data[1].decode().split(";")) == 3

if __name__ == "__main__":
    asyncio.run(test_produce())
