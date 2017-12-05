const { cl } = require('./util');
const Wallet = require('./wallet');
const URI = {
    livenet:'https://insight.dashevo.org/',
    testnet:'https://testnet-insight.dashevo.org/'
};


const networkType = 'testnet';
const seed = "fiscal gap clutch bridge shrug napkin want foam seek able lucky valley";



let init = function init(){

    cl(`Seed is ${seed}`);
    cl(`Wallet on ${networkType}`);
    let wallet = new Wallet({seed:seed, network:networkType});
    wallet.events.on('loaded', async function () {
        console.log('Wallet Loaded!')
        // console.log(wallet)

        let balance = await wallet.get('balance');
        console.log('Balance is', balance);

        let fundNeeded = (balance===0);

        if(fundNeeded){
            console.log('Funding needed, deposit tDash to this address :',wallet.keys.root.public);
            throw new Error('Implementation needed ! Await for deposit');
        }else{
            console.log('No funding needed - ready to go !');
        }

        let amount = 400;
        let isInstant = true;
        let deposit = await wallet.getNewDepositWallet()
        let change = await wallet.getNewChangeWallet()
        console.log(`Sending ${(isInstant===true && 'instantsend')  || 'standard'} transaction`);
        console.log('deposit for paying:', deposit.addr, ' bal:',deposit.balance, 'used:',deposit.used)
        console.log('change of payment:', change.addr, ' bal:',change.balance, 'used:',change.used)
        console.log('amount of payment:', amount,'(dash)')

        // wallet.displayWallets()
        //No from as the pay fn will know which inputs using
        let tx = await wallet.pay({instant:isInstant, to:deposit.addr, change:change.addr, amount:amount})

        // await wallet.displayWallets();
    })
}
init()