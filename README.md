instantsend-broadcast

Tool for helping generate transaction on a network (intended for testnet mainly)

# Actual State

    - Expect you to provide a seed in index.js
    - And having at least one of the address (change or not) with some tDash
    - Depending on if you chose to have a Instant or not, it will check for utxo, select them, create a transaction and perform the transaction (by default it send to yourself using empty deposit and empty change address)

# In the future
    - Improvements
        - Selection of UTXO can be greaaatly improved
        - In UTXO for IS, we fail if we can't do that in a naive way, we might want to propose alternative way (multiple inputs)
    - Experience :
        You should be able if you didn't specify any seed to have a seed created for you, which will propose you to fund a first address with a faucet, and then propose you to create X utxo in Y different wallet and perform Z transaction every T time.
        So you can simulate a real network of transaction with IS or not. This tool should be able to offer you various way of testings etc... A lot of improvements can be done, contributions welcomed for now I will stick for what I need during the flow

