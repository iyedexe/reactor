from producer import generate_random_market_data

def test_market_data():
    bid, ask, timestamp = generate_random_market_data()
    assert bid >= 10
    assert ask >= bid
    assert 50 >= bid
