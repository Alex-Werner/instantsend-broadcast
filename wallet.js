

const Bitcore = require('bitcore-lib-dash');
const Mnemonic = require('bitcore-mnemonic-dash');
const Address = Bitcore.Address;
const Transaction = Bitcore.Transaction;
const {getBalance, getTx, getUtxo}=require('./util');
const EventEmitter = require('eventemitter2');

class Wallet {
     constructor(opts){
        this.wallets = {};
        if(opts){
            if(opts.network){
                opts.network=='livenet' ? (Bitcore.Networks.defaultNetwork = Bitcore.Networks.livenet) : (Bitcore.Networks.defaultNetwork = Bitcore.Networks.testnet);
                this.set('network',opts.network)
            }
            if(opts.seed){
                this.set('seed',opts.seed);
            }

        }
        this.init();
        this.events = new EventEmitter();
     }
    async init(){
        //We probably want to do that more often... or bloom filter =D
        await this.refreshWallets();
        this.events.emit('loaded', true);

    }
    async set(type,value){
        if(type=='seed'){
            let seed = new Mnemonic(value).toSeed();
	        let rootPrvKey = new Bitcore.HDPrivateKey.fromSeed(seed);
            let rootPubAddr = new Address(rootPrvKey.publicKey);

            this.mnemonic = seed;
            this.keys = {
                root:{
                    private:rootPrvKey,
                    public:rootPubAddr
                }
            }
        }
        this[type]=value;
    }
    async get(type){
        if(type=='balance'){
            this[type] = await this.calculateBalance()
        }
        return this[type];
    }
    async calculateBalance(){
        let keys = Object.keys(this.wallets)
        let total = 0;
        let self = this;
        keys.forEach(function(val,k){
            total += self.wallets[val].balance;
        })
        return total;
    }
    //Will refresh the wallet so it is BIP32 valid
    async refreshWallets(){
        const gapLimit = 1; //after 20 empty addresse we drop out

        //Deposit
        for(let i = 0, consecutivelyEmpty= 0; consecutivelyEmpty<gapLimit; i++){
            let wallet = await this.refreshWallet({derive:`m/44'/1'/0'/0/${i}`})
            if(!wallet.used){
                consecutivelyEmpty++;
            }
        }
        //Change
        for(let i = 0, consecutivelyEmpty= 0; consecutivelyEmpty<gapLimit; i++){
            let wallet = await this.refreshWallet({derive:`m/44'/1'/0'/1/${i}`})
            if(!wallet.used){
                consecutivelyEmpty++;
            }
        }
    }
     async getNewDepositWallet(){
        for(let i = 0, isUsed=1;isUsed>0;i++){
            let used = this.wallets[`m/44'/1'/0'/0/${i}`].used
            if(!used){
                isUsed = 0;
                return this.wallets[`m/44'/1'/0'/0/${i}`];
            }

        }
    }
    async getNewChangeWallet(){
        for(let i = 0, isUsed=1;isUsed>0;i++){
            let used = this.wallets[`m/44'/1'/0'/1/${i}`].used
            if(!used){
                isUsed = 0;
                return this.wallets[`m/44'/1'/0'/1/${i}`];
            }
        }
    }
    async refreshWallet(opts){
        if(opts.derive) {
            let hdPrivKey = this.keys.root.private.derive(opts.derive);
            let addr = new Address(hdPrivKey.publicKey).toString();
            let balance = await getBalance(addr, this.network)
            let tx = await getTx(addr, this.network);
            let _b = {
                addr: new Address(hdPrivKey.publicKey).toString(),
                keys: {
                    private: hdPrivKey
                },
                balance: balance,
                tx:tx,
                used:(tx.length===0) ? false : true
            }
            this.wallets[opts.derive] = _b;
            return _b;
        }
    }
    async pay(opts){
        let to = null;
        let amount = null;
        let instant = false;
        let from = null;
        let change = null;

        if(opts){
            if(opts.instant===true){
                instant=true;
            }
            if(opts.amount){
                amount=opts.amount;
            }
            if(opts.to){
                to = opts.to
            }
            if(opts.from){
                from = opts.from;
            }
        }

        let addrs = [];
        if(from===null){
            console.log('No from specified, seeking candidate')
            addrs = this.getInputAddrForAmount(amount);
            console.log('Candidates :', addrs)
            if(addrs.length===0){
                //sorry not enought fund
                console.error('Not enought fund found');
            }else{
                if(addrs.length===1){
                    from = addrs[0];
                    console.log('One found, from has :', from.balance, 'needed:',amount)
                }
            }
        }

        let utxos = await getUtxo(from.addr, this.network);
        if(instant){
            const conditions = {
      	        minFee: 200000,
 		        minConf: 6,
 	    	    maxVout: 100
       	    }
       	    if(utxos.length>=conditions.maxVout){
                console.error(`Implementation error, more than ${conditions.maxVout} utxos`)
                return false;
            }
            //fixme naive implementation we have to handle that at some point
       	    let utxosFiltered = utxos.filter(function(utxo){
       	        return utxo.confirmations >= conditions.minConf;
            })
            if(utxos.length!==utxosFiltered.length){
       	        console.log('It failed.')
                throw new Error('Nope')
       	    }else{
                console.log('Valid utxos')
            }
        }
        let utxosNormalized = utxos.filter(function (el) {
            return {
                address:el.address,
                txId:el.txid,
                outputIndex:el.vout,
                script:Bitcore.Script.fromHex(el.scriptPubKey),
                satoshis:el.satoshis
            }
        })
        let sum = utxosNormalized.reduce((acc, cur)=>{
            return acc + cur.amount
        },0);
        let utxosSatoshis = sum*1000*1000;
        let toSatoshis = amount*1000*1000;
        let feeSatoshis = (instant===true) ? (100000) : (10000);
        let changeSatoshis = utxosSatoshis - toSatoshis - feeSatoshis

        let valid = (utxosSatoshis === (toSatoshis+feeSatoshis+changeSatoshis))
        console.log('valid', valid, 'utxoSat:',utxosSatoshis, 'toSat', toSatoshis,'feeSat', feeSatoshis, 'changeSat', changeSatoshis)
        let tx = new Transaction()
            .from(utxosNormalized)
            .to(to, satoshis - amount*1000*1000)
            .change(change);

            (instant===true) ? tx.fee(10000) : tx.feePerKb(10000);


        // }
    }
    displayWallets(){
        console.log(`---------- Wallet`);
        console.log(this.wallets);
    }
    getInputAddrForAmount(amount){
        let addrs = [];

        let keys = Object.keys(this.wallets)
        let total = 0;
        let self = this;
        keys.forEach(function(val,k){
            if(total<amount){
                addrs.push(self.wallets[val]);
            }
            total += self.wallets[val].balance;
        })
        return addrs;
    }
}
module.exports = Wallet;