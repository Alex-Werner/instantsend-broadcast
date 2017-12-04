const URI = {
    livenet:'https://insight.dashevo.org/',
    testnet:'https://testnet-insight.dashevo.org/'
};
const axios = require('axios');

module.exports = {
    cl:console.log,
    getBalance:async function(address, network){
        let uri = URI[network]+`insight-api-dash/addr/${address}`;
        console.log(uri)
        let body = await axios.get(uri);
        let data = body.data;
        return data.balance;
    },
    getTx:async function(address, network){
        let uri = URI[network]+`insight-api-dash/addr/${address}`;
        console.log(uri)
        let body = await axios.get(uri);
        let data = body.data;
        return data.transactions;
    },
    getUtxo:async function(address, network) {
        let uri = URI[network]+`insight-api-dash/addr/${address}/utxo`;
        console.log(uri)
        let body = await axios.get(uri);
        let data = body.data;
        return data;
    }
}