from datetime import datetime
import asyncio
import random
import datetime
from threading import Thread
# itertools 
# functools decorators injection du type pour un encoder généralisé
# calcul matriciel maths via numpy
# decorateurs
# code consommateur
# numba
# algo djikstra et gluton sur numba avec timeit
# distance de hamming

class MarketDataTick():
    def __init__(self, bid, ask, timestamp):
        self.bid = bid
        self.ask = ask
        self.timestamp = timestamp

class BaseEncoder:
    def __init__(self):
        pass

    def encode(self, data):
        pass
    
    def decode(self, data):
        pass

class DataEncoder(BaseEncoder):
    def __init__(self):
        pass

    def encode(self, data : MarketDataTick):
        data_list = [data.bid, data.ask, data.timestamp]
        return ("["+";".join([str(elem) for elem in data_list])+"]").encode()
    
    def decode(self, buffer) -> MarketDataTick:
        buffer_str = buffer.decode()
        end_index = buffer_str.find("]")
        if end_index !=-1:
            #new packet arrived
            start_index = buffer_str.find("[")
            data = []
            if start_index != -1:
                parsed_data = buffer_str[start_index:end_index+1] 
                # print(f"new packet arrived {parsed_data}")
                data = parsed_data.split(";")
                # print(f"new buffer : {buffer_str[end_index+1:]}")
                new_buffer = (buffer_str[end_index+1:]).encode()
                return new_buffer, MarketDataTick(data[0][1:], float(data[1]), float(data[2][:-1]))
        else:
            #incomplete message
            # print("[DECODER] Data incomplete")
            return buffer, None
        
class MarketDataProducer:
    def __init__(self, interval=[10,50]):
        self.min = interval[0]
        self.max = interval[1]

    def generate_random_market_data(self):
        ct = datetime.datetime.now()
        ts = ct.timestamp()
        bid = self.min+(self.max-self.min)*random.random() 
        ask = bid + (self.max-bid)*random.random()
        return MarketDataTick(bid, ask, ts)          

    def produce(self) -> MarketDataTick:
        data = self.generate_random_market_data()
        return data
    

class TransportServer:
    def __init__(self, host, port, producer, encoder):
        self.host = host
        self.port = port
        self.producer = producer
        self.encoder = encoder
        self.run = False
        self.run_thread = Thread(target=self._target)
        
    def start(self):
        print(f'Starting server')
        self.run_thread.start()

    def _target(self):
        asyncio.run(self._run())

    async def _run(self):
        self.server = await asyncio.start_server(
            self._send, self.host, self.port)
        self.run = True
        addrs = ', '.join(str(sock.getsockname()) for sock in self.server.sockets)
        print(f'Serving on {addrs}')

        async with self.server:
            await self.server.serve_forever()
        print("Exited run forever")

    async def _send(self, reader, writer):
        while self.run:
            print("Server running")
            encoded_message = self.encoder.encode(self.producer.produce())
            writer.write(encoded_message)
            await writer.drain()
            await asyncio.sleep(5)
        writer.write("\n".encode())
        await writer.drain()

        print(f'Closing writer connection')
        writer.close()
        print(f'Sent instruction to close writer')
        await writer.wait_closed()
        print(f'Writer successfully closed')

    def stop(self):
        asyncio.run(self._stop())

    async def _stop(self):
        print(f'Stopping server')
        self.run=False
        self.server.close()
        await self.server.wait_closed()
        self.run_thread.join()

# commande depuis le main start async stop
# les commandes sont stockées et procéssé a la suite
# consommatuer 2 nouveau classes

def main():
    producer = MarketDataProducer()
    encoder = DataEncoder()
    server = TransportServer("127.0.0.1", 8881, producer, encoder)
    server.start()
    print("Back to main, waiting for input")
    input()
    server.stop()

if __name__ == "__main__":
    main()