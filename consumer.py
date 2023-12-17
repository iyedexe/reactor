import asyncio

async def consume(depth, interval):
    reader, writer = await asyncio.open_connection(
        '127.0.0.1', 8888)
    run=True
    moving_average=0
    print('[CONSUMER] Open the connection')
    unparsed_data= ""
    while run:
        data = await reader.read(2)
        str_data = data.decode()
        print(f"recieved {str_data}")
        unparsed_data += str_data
        index = unparsed_data.find("]")
        if index !=-1:
            #new packet arrived
            start_index = unparsed_data.find("[")
            if start_index != -1:
                parsed_data = unparsed_data[start_index:index+1] 
                print(f"new packet arrived {parsed_data}")
            #else discard this data
            unparsed_data = unparsed_data[index+1:]

asyncio.run(consume(3,3))
