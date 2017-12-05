const Mnemonic = require('bitcore-mnemonic-dash');
const Bitcore = require('bitcore-lib-dash');
const Address = Bitcore.Address;
const Transaction = Bitcore.Transaction;
const {getBalance, getTx, getUtxo, broadcastTransaction} = require('./util');
const EventEmitter = require('eventemitter2');

class Wallet {
    constructor(opts) {
        this.wallets = {};
        if (opts) {
            if (opts.network) {
                this.set('network', opts.network)
            }
            if (opts.seed) {
                this.set('seed', opts.seed);
            }

        }
        this.init();
        this.events = new EventEmitter();
    }

    async init() {
        //We probably want to do that more often... or bloom filter =D
        await this.refreshWallets();
        this.events.emit('loaded', true);

    }

    async set(type, value) {
        if (type === 'network' && value === 'testnet') {
            Bitcore.Networks.defaultNetwork = Bitcore.Networks.testnet;
        }
        if (type == 'seed') {
            let seed = new Mnemonic(value).toSeed();
            let rootPrvKey = new Bitcore.HDPrivateKey.fromSeed(seed);
            let rootPubAddr = new Address(rootPrvKey.publicKey);

            this.mnemonic = seed;
            this.keys = {
                root: {
                    private: rootPrvKey,
                    public: rootPubAddr
                }
            }
        }
        this[type] = value;
    }

    async get(type) {
        if (type == 'balance') {
            this[type] = await this.calculateBalance()
        }
        return this[type];
    }

    async calculateBalance() {
        let keys = Object.keys(this.wallets)
        let total = 0;
        let self = this;
        keys.forEach(function (val, k) {
            total += self.wallets[val].balance;
        })
        return total;
    }

    //Will refresh the wallet so it is BIP32 valid
    async refreshWallets() {
        const gapLimit = 1; //after 20 empty addresse we drop out

        //Deposit
        for (let i = 0, consecutivelyEmpty = 0; consecutivelyEmpty < gapLimit; i++) {
            let wallet = await this.refreshWallet({derive: `m/44'/1'/0'/0/${i}`})
            if (!wallet.used) {
                consecutivelyEmpty++;
            }
        }
        //Change
        for (let i = 0, consecutivelyEmpty = 0; consecutivelyEmpty < gapLimit; i++) {
            let wallet = await this.refreshWallet({derive: `m/44'/1'/0'/1/${i}`})
            if (!wallet.used) {
                consecutivelyEmpty++;
            }
        }
    }

    async getNewDepositWallet() {
        for (let i = 0, isUsed = 1; isUsed > 0; i++) {
            let used = this.wallets[`m/44'/1'/0'/0/${i}`].used
            if (!used) {
                isUsed = 0;
                return this.wallets[`m/44'/1'/0'/0/${i}`];
            }

        }
    }

    async getNewChangeWallet() {
        for (let i = 0, isUsed = 1; isUsed > 0; i++) {
            let used = this.wallets[`m/44'/1'/0'/1/${i}`].used
            if (!used) {
                isUsed = 0;
                return this.wallets[`m/44'/1'/0'/1/${i}`];
            }
        }
    }

    async refreshWallet(opts) {
        if (opts.derive) {
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
                tx: tx,
                used: (tx.length === 0) ? false : true
            }
            this.wallets[opts.derive] = _b;
            return _b;
        }
    }

    async getAvailableInputs() {
        let keys = Object.keys(this.wallets);
        let total = 0;
        let self = this;
        let addrs = [];

        keys.forEach(function (val) {
            if (self.wallets[val].balance > 0) {
                addrs.push(self.wallets[val]);
            }
        });

        return addrs;

    }

    async selectBestInputsForAmount(amount, isInstant = false) {

        let listInputs = [];
        // let inputs = this.getInputAddrForAmount(amount)
        let inputs = await this.getAvailableInputs();

        inputs = inputs.sort(function (a, b) {
            return a.balance > b.balance
        });

        // 1) Search for inputs with sufficiant amount
        let sufficiantsInputs = inputs.filter(function (input) {
            return input.balance >= amount;
        })
        if (sufficiantsInputs.length > 0) {
            return sufficiantsInputs[0];
        } else {
            console.log({sufficiantsInputs, amount, inputs});
            throw new Error();
        }

    }

    async normalizeUtxos(utxos) {
        return utxos.map(function (el) {
            return {
                address: el.address,
                txId: el.txid,
                outputIndex: el.vout,
                script: Bitcore.Script.fromHex(el.scriptPubKey),
                satoshis: el.satoshis,
            }
        })
    }

    async pay(opts) {
        const ISconditions = {
            minFee: 10000,
            minConf: 6,
            maxVout: 100,
            maxValue:1000*1e8
        }

        let to = null;
        let amount = null;
        let isInstant = false;
        let from = null;
        let change = null;
        let privateKey = null;
        if (opts) {
            if (opts.instant === true) {
                isInstant = true;
            }
            if (opts.amount) {
                amount = opts.amount;
            }
            if (opts.to) {
                to = opts.to
            }
            if (opts.change) {
                change = opts.change
            }
            if (opts.from) {
                from = opts.from;
            }
        }

        if (from === null) {
            console.log('No from specified, seeking candidate')
            let inputs = await this.selectBestInputsForAmount(amount, isInstant);
            let utxos = await getUtxo(inputs.addr, this.network);

            if(isInstant){
                utxos = utxos.filter(function (utxo) {
                    return utxo.confirmations >= ISconditions.minConf;
                })
            }
            utxos = await this.normalizeUtxos(utxos);

            if (isInstant && utxos.length >= ISconditions.maxVout) {
                console.error(`Implementation error, more than ${ISconditions.maxVout} utxos`)
                return false;
            }

            let sumUtxos = utxos.reduce((acc, cur) => {
                return acc + cur.satoshis
            }, 0);
            if (isInstant && utxosSatoshis>ISconditions.maxValue){
                throw new Error(`MaxOutput value too big  more than ${ISconditions.maxValue} utxos `);
            }
            let utxosSatoshis = sumUtxos;

            let toSatoshis = amount * 1e8;
            let feeSatoshis = (isInstant === true) ? (100000) : (1000);
            let changeSatoshis = utxosSatoshis - toSatoshis - feeSatoshis
            let valid = (utxosSatoshis === (toSatoshis + feeSatoshis + changeSatoshis))

            console.log('instant', isInstant, 'valid', valid, 'utxoSat:', utxosSatoshis, 'toSat', toSatoshis, 'feeSat', feeSatoshis, 'changeSat', changeSatoshis);
            let tx = await this.createTransaction({
                from: utxos,
                to: to,
                toSatoshis: toSatoshis,
                change: change,
                changeSatoshis: changeSatoshis,
                instant: isInstant,
                feeSatoshis: feeSatoshis,
                privateKey: inputs.keys.private.privateKey.toString()
            });
            let txid = await this.broadcastTransaction(isInstant, tx.toString(), 'testnet');
            console.log(`TXID: ${txid}`);


        } else {
            throw new Error('Not implemented');
        }

    }

    async createTransaction(data) {

        let tx = new Transaction()
            .from(data.from)//fixme
            .to(data.to, data.toSatoshis)
            .change(data.change, data.changeSatoshis);
        if (data.instant === true) {
            tx.fee(data.feeSatoshis)
        } else {
            tx.feePerKb(data.feeSatoshis);
        }
        tx.sign(data.privateKey)
        return tx;
    }

    async broadcastTransaction(isInstant, txHex, network) {
        let broascast = await broadcastTransaction({instant: isInstant, tx: txHex, network: network});
        return broascast.txid;
    }


    displayWallets() {
        console.log(`---------- Wallet`);
        console.log(this.wallets);
    }

    getInputAddrForAmount(amount) {
        let addrs = [];

        let keys = Object.keys(this.wallets)
        let total = 0;
        let self = this;
        keys.forEach(function (val, k) {
            if (total < amount) {
                addrs.push(self.wallets[val]);
            }
            total += self.wallets[val].balance;
        })
        return addrs;
    }
}

module.exports = Wallet;