import asyncio
import threading
import pandas as pd
import numpy as np

from producer import DataEncoder
from producer import MarketDataTick
#cosume qui pique la data et submit dans un worker le process
#layer listen
#encodage possible : 4 premiers octets pour donner la taille du message/ fixee ou variable.
#try catch sur les appels async reseau
#peut etre encapsulé comme c'est toujours fixé
MAX_DATA_SIZE = 900
class Listener:
    def __init__(self, host, port, decoder, consumer):
        self.host = host
        self.port = port
        self.decoder = decoder
        self.consumer = consumer
        self.callback = None
        self.run = False
        self.buffer = b""
        self.listen_thread = threading.Thread(target=self._target)

    def start(self):
        print(f'Starting server')
        self.listen_thread.start()

    def _target(self):
        asyncio.run(self.listen())
        
    async def listen(self):
        self.reader, self.writer = await asyncio.open_connection(
            '127.0.0.1', 8881)
        self.run = True
        while self.run:
            self.buffer += await self.reader.read(1)
            # print(f"buffer before decoding = {self.buffer}")
            self.buffer, data = self.decoder.decode(self.buffer)
            # print(f"buffer after decoding = {self.buffer}")
            if data is not None:
                print("Consuming data")
                self.consumer.consume(data) 

        self.writer.close()
        print(f'Sent instruction to close writer')
        await self.writer.wait_closed()

    def stop(self):
        print(f'Stopping server')
        self.run =False
        self.listen_thread.join()

class ConsumerClient:
    def __init__(self, window=5):
        self.init = False
        # self.data =  # ou mieux une struc qui prend une market data tick en input
        self.timestamps = np.zeros((MAX_DATA_SIZE), dtype=np.datetime64)
        self.data = np.zeros((MAX_DATA_SIZE, 2), dtype=float)
        self.cursor = 0
        self.window = window
    
    def consume(self, data: MarketDataTick):
        # mettre dans une structure commune
        # self.timestamps[self.cursor] = np.datetime64(data.timestamp) 
        self.data[self.cursor][0] = float(data.bid)
        self.data[self.cursor][1] = float(data.ask)
        self.cursor+=1
        self.compute_average()
            
    def compute_average(self):
        if self.cursor>=self.window:
            view = self.data[self.cursor-self.window:self.cursor+1]
            start_ts = view[0][0]
            end_ts = view[-1][0]
            stats = np.median(view, axis = 1)
            print(f"bid moving average : {stats[1]}")
            print(f"ask moving average : {stats[2]}")

def main():
    consumer = ConsumerClient()
    decoder = DataEncoder()
    listener = Listener("127.0.0.1", 8881, decoder, consumer)
    listener.start()
    input()
    consumer.compute_average()
    listener.stop()
    print("Success stop")

if __name__ == "__main__":
    main()

# ecrire test
# faire tourner les test
# générer un packet python 
    

# types génériques
# onions en python comme en c++
# abc pour créer des interfaces
# revoir functools les constructuer __call__
# les grecs
# estimations d'options
# options sur fixed income
# stats et ML 
# methode de newton montecarl
# stripping courbe de taux, zero coupon
# interpolation
# IRS, CDS, payoff de base
# evolution des prix de bonds
# black and scholes
# calculer la probabilité et la fonction de repartiition d'un dataset donné en utilisant le theoreme de limite centrale
# hypothesis testing