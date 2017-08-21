const insightURI = "http://dev-test.insight.dashevo.org/insight-api-dash/";
async function getBalance(address) {
	let uri = `${insightURI}addr/${address}`;
	let body = await axios.get(uri);
	let data = body.data;
	return data.balance;
}

async function getUTXO(addr) {
	let uri = `${insightURI}addr/${addr}/utxo`;
	let body = await axios.get(uri);
	return body.data;
}
async function broadcastTransaction(rawtx, isInstantSend) {
	let uri = `${insightURI}tx/send`;
	if (isInstantSend === true) uri += 'ix';
	console.log(uri);

	try {
		let body = await axios.post(uri, {rawtx: rawtx});
		console.log(body.data);
	} catch (e) {
		console.log(e.response.data);
	}
	// let data = body.data;
}

const cl = console.log;
const axios = require('axios');
const Bitcore = require('bitcore-lib-dash');
const Mnemonic = require('bitcore-mnemonic-dash');
const Address = Bitcore.Address;
const Transaction = Bitcore.Transaction;

Bitcore.Networks.defaultNetwork = Bitcore.Networks.testnet;
// const mnemonicPhrase = "judge creek area valley metal obvious mechanic giant broom umbrella prefer amused";
// const mnemonicPhrase = "inflict about smart zoo ethics ignore retire expand peasant draft sock raven";
const mnemonicPhrase = "fiscal gap clutch bridge shrug napkin want foam seek able lucky valley";


async function makeIXTransaction(params) {
	if (!params
		|| !params.hasOwnProperty('from')
		|| !params.hasOwnProperty('sign')
		|| !params.hasOwnProperty('to')
		|| !params.hasOwnProperty('change')
	) {
		throw new Error('Missing params');
	}

	let conditions = {
		minFee: 200000,
		minConf: 6,
		maxVout: 100
	}
	let utxos = (await getUTXO(params.from));
	let foundCandidate = false;
	let txid = null, outputIndex = null, script = null, satoshis = null;

	for (let i = 0; i < utxos.length; i++) {
		let _utxo = utxos[i];
		
		if (_utxo.confirmations >= conditions.minConf) {
			if (_utxo.satoshis >= conditions.minFee) {
				if (_utxo.vout <= conditions.maxVout) {
					console.log('\nGood candidate for IX on', _utxo, '\n');
					script=_utxo.scriptPubKey;
					txid=_utxo.txid;
					outputIndex=_utxo.vout;
					satoshis=_utxo.satoshis;
					foundCandidate = true;
					break;
				}
				console.log('Bad candidate - Too many vout -  trying next');
			}
			console.log('Bad candidate - not enought satoshi - trying next');
		}
		else {
			console.log(`Bad candidate - Not enought conf (${_utxo.confirmations} < ${conditions.minConf}), trying next`);
		}
	}
	if (!foundCandidate)
		console.error('Err sending IX : Impossible, no candidate');
	else {
		let utxo = {
			address: params.from,
			txId: txid,
			outputIndex: outputIndex,
			script: Bitcore.Script.fromHex(script),
			satoshis: satoshis
		}
		// console.log(utxo);

		params.to = "yaKrnRKThhCgqcHxqCZ1VRDiC2oGgE3rE9";
		let tx = new Transaction()
		.from(utxo)
		.to(params.to, satoshis - conditions.minFee)
		.change(params.change)
		.feePerKb(100000)
		.sign(params.sign);

		let tx2 = new Transaction()
		.from(utxo)
		.to(params.to, satoshis - conditions.minFee)
		.change(params.change)
		.fee(200000)
		.sign(params.sign);

		console.log(tx.toString());
		await broadcastTransaction(tx.toString(), true);
		setTimeout(async function(){
			console.log(tx2.toString());
			await broadcastTransaction(tx2.toString(), true)
		},1000);

	}
};

async function startProcess() {
	let seed = new Mnemonic(mnemonicPhrase).toSeed();
	let rootPrvKey = new Bitcore.HDPrivateKey.fromSeed(seed);
	let rootPubAddr = new Address(rootPrvKey.publicKey);

	let changePrvKey = rootPrvKey.derive(`m/44'/1'/0'/1/0`);
	let destPrvKey = rootPrvKey.derive(`m/44'/1'/0'/0/10`);

	let hdprivkey = null;
	let addr = null;
	let found = false;
	let deriv = null;

	//Search for a balance >= 1 dash
	for (let i = 0; i < 20; i++) {
		deriv = `m/44'/1'/0'/0/${i}`;//testnet : 1/ livenet:5.
		hdprivkey = rootPrvKey.derive(deriv);
		addr = new Address(hdprivkey.publicKey).toString();
		cl(addr, hdprivkey.privateKey)
		let bal = await getBalance(addr);
		if (bal > 1) {
			found = true;
			console.log(`Found ${bal} on ${addr} with derive ${deriv}`);
		}
		if (found)
			break;
	}
	// await mkTx();
	//if found, make tx.
	if (found) {
		let tx = new Transaction()
		.from({
			address: "yR9gubqwbhFvdEz6qvR89fFbmjgrnLxnEm",
			txId: "30f09fd4185acdcef00aa54d73c19cca7e3266d28b5aa7d61d6781873d5bac7b",
			outputIndex: 0,
			script: Bitcore.Script.fromHex("76a9143500346f6c666aee9740b35ad81c3c191fcf64f088ac"),
			satoshis: 100000000000
		})
		.from({
			address: "yR9gubqwbhFvdEz6qvR89fFbmjgrnLxnEm",
			txId: "83141db183656007776d4280ce1e26a56fc739c3f3190faf30cdc6db2106851b",
			outputIndex: 0,
			script: Bitcore.Script.fromHex("76a9143500346f6c666aee9740b35ad81c3c191fcf64f088ac"),
			satoshis: 100000000000
		})
		.to("yaKrnRKThhCgqcHxqCZ1VRDiC2oGgE3rE9", 200000000000 - 100000)
		.change("yfGjhXSfi91GEFLoF1XQxWJHPBE66D66T9")
		.feePerKb(100000)
		.sign(hdprivkey.privateKey.toString());
		await broadcastTransaction(tx.toString(), true)

		/*await makeIXTransaction({
			from: addr,
			sign: hdprivkey.privateKey.toString(),
			to: new Address(destPrvKey.publicKey).toString(),
			change: new Address(changePrvKey.publicKey).toString()
		});*/
	}
}


startProcess();