// server/index.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const cors = require('cors');
const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'https://testnet-rpc.monad.xyz';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x07169f0F890C3595421512D98DC79b8bce6E5fA6';
const CHAIN_ID = Number(process.env.CHAIN_ID || 10143);
const PORT = Number(process.env.PORT || process.env.PORT || 3000);

// Full ABI (from user's contract)
const ABI = [
  {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"string","name":"tick","type":"string"},{"indexed":false,"internalType":"uint256","name":"maxSupply","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"limitPerMint","type":"uint256"},{"indexed":false,"internalType":"address","name":"deployer","type":"address"}],"name":"Deploy","type":"event"},
  {"inputs":[{"internalType":"string","name":"tick","type":"string"},{"internalType":"uint256","name":"maxSupply","type":"uint256"},{"internalType":"uint256","name":"limitPerMint","type":"uint256"}],"name":"deployToken","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"emergencyWithdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"string","name":"tick","type":"string"},{"indexed":false,"internalType":"string","name":"operation","type":"string"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"string","name":"data","type":"string"},{"indexed":false,"internalType":"uint256","name":"inscriptionNumber","type":"uint256"}],"name":"Inscribe","type":"event"},
  {"inputs":[{"internalType":"string","name":"tick","type":"string"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"setDeployFee","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"setMintFee","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"string","name":"tick","type":"string"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"stateMutability":"payable","type":"receive"},
  {"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"string","name":"","type":"string"}],"name":"balances","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"deployFee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"string","name":"tick","type":"string"}],"name":"getBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"tick","type":"string"}],"name":"getHolders","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"tick","type":"string"}],"name":"getHoldersCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"tick","type":"string"}],"name":"getMintProgress","outputs":[{"internalType":"uint256","name":"minted","type":"uint256"},{"internalType":"uint256","name":"maxSupply","type":"uint256"},{"internalType":"uint256","name":"percentage","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"tick","type":"string"}],"name":"getTokenInfo","outputs":[{"internalType":"uint256","name":"maxSupply","type":"uint256"},{"internalType":"uint256","name":"limitPerMint","type":"uint256"},{"internalType":"uint256","name":"minted","type":"uint256"},{"internalType":"address","name":"deployer","type":"address"},{"internalType":"uint256","name":"holdersCount","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"tick","type":"string"}],"name":"getTotalMinted","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"","type":"string"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"holders","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"inscriptionCounter","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"","type":"string"},{"internalType":"address","name":"","type":"address"}],"name":"isHolder","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"mintFee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"","type":"string"}],"name":"tokens","outputs":[{"internalType":"uint256","name":"maxSupply","type":"uint256"},{"internalType":"uint256","name":"limitPerMint","type":"uint256"},{"internalType":"address","name":"deployer","type":"address"},{"internalType":"bool","name":"exists","type":"bool"},{"internalType":"uint256","name":"deployedAt","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"","type":"string"}],"name":"totalMinted","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
];

const db = new Database('./data.db');
db.exec(`
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS tokens (tick TEXT PRIMARY KEY, maxSupply TEXT, limitPerMint TEXT, minted TEXT, deployer TEXT, holdersCount TEXT, deployedAt INTEGER);
CREATE TABLE IF NOT EXISTS inscribes (id INTEGER PRIMARY KEY AUTOINCREMENT, blockNumber INTEGER, user TEXT, tick TEXT, operation TEXT, amount TEXT, data TEXT, inscriptionNumber TEXT, time INTEGER);
`);

const getMeta = (k, def) => {
  const row = db.prepare('SELECT v FROM meta WHERE k=?').get(k);
  return row ? JSON.parse(row.v) : def;
};
const setMeta = (k,v) => db.prepare('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)').run(k, JSON.stringify(v));

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcastJSON(obj){
  const s = JSON.stringify(obj);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(s); });
}

// If meta lastSyncedBlock not set, initialize from env START_BLOCK (optional)
if (getMeta('lastSyncedBlock', null) === null) {
  const startBlock = Number(process.env.START_BLOCK || 0);
  setMeta('lastSyncedBlock', startBlock);
  console.log('Initialized lastSyncedBlock to', startBlock);
}

// fetch logs in batches (respect RPC limit)
async function fetchLogsBatched(filter, fromBlock, toBlock, batchSize = 100) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += batchSize) {
    const end = Math.min(toBlock, start + batchSize - 1);
    try {
      const batch = await provider.getLogs({ ...filter, fromBlock: start, toBlock: end });
      logs.push(...batch);
    } catch (e) {
      console.warn('fetchLogsBatched failed', start, end, e.message || e);
      if (batchSize > 1) {
        const nested = await fetchLogsBatched(filter, start, end, Math.floor(batchSize / 2));
        logs.push(...nested);
      } else throw e;
    }
    // small delay to ease RPC pressure
    await new Promise(r => setTimeout(r, 80));
  }
  return logs;
}

async function indexerLoop() {
  try {
    const last = getMeta('lastSyncedBlock', 0);
    const latest = await provider.getBlockNumber();
    const from = Math.max(0, last + 1);
    const to = latest;
    if (from > to) return;
    console.log('Indexing from', from, 'to', to);

    // Deploy events
    const deployFilter = contract.filters.Deploy();
    const deployLogs = await fetchLogsBatched(deployFilter, from, to, 100);
    for (const l of deployLogs) {
      try {
        const parsed = contract.interface.parseLog(l);
        const tick = parsed.args.tick;
        const info = await contract.getTokenInfo(tick);
        db.prepare('INSERT OR REPLACE INTO tokens (tick,maxSupply,limitPerMint,minted,deployer,holdersCount,deployedAt) VALUES (?,?,?,?,?,?,?)')
          .run(tick, info.maxSupply.toString(), info.limitPerMint.toString(), info.minted.toString(), info.deployer, info.holdersCount.toString(), l.blockNumber);
      } catch (e) {
        console.warn('deploy parse/store failed', e);
      }
    }

    // Inscribe events
    const inscribeFilter = contract.filters.Inscribe();
    const inscribeLogs = await fetchLogsBatched(inscribeFilter, from, to, 100);
    for (const l of inscribeLogs) {
      try {
        const p = contract.interface.parseLog(l);
        let block;
        try { block = await provider.getBlock(l.blockNumber); } catch (e) { block = { timestamp: Math.floor(Date.now() / 1000) }; }
        db.prepare('INSERT INTO inscribes (blockNumber,user,tick,operation,amount,data,inscriptionNumber,time) VALUES (?,?,?,?,?,?,?,?)')
          .run(l.blockNumber, p.args.user, p.args.tick, p.args.operation, p.args.amount.toString(), p.args.data, p.args.inscriptionNumber.toString(), block.timestamp);
        // update token minted/holders
        try {
          const info = await contract.getTokenInfo(p.args.tick);
          db.prepare('INSERT OR REPLACE INTO tokens (tick,maxSupply,limitPerMint,minted,deployer,holdersCount,deployedAt) VALUES (?,?,?,?,?,?,?)')
            .run(p.args.tick, info.maxSupply.toString(), info.limitPerMint.toString(), info.minted.toString(), info.deployer, info.holdersCount.toString(), null);
        } catch (err) {}
      } catch (e) {
        console.warn('inscribe parse/store failed', e);
      }
    }

    setMeta('lastSyncedBlock', to);
    // broadcast snapshot & recent inscribes
    const tokens = db.prepare('SELECT tick,maxSupply,limitPerMint,minted,deployer,holdersCount,deployedAt FROM tokens ORDER BY deployedAt DESC').all();
    const recent = db.prepare('SELECT blockNumber,user,tick,operation,amount,data,inscriptionNumber,time FROM inscribes ORDER BY blockNumber DESC LIMIT 200').all();
    broadcastJSON({ type: 'tokens_snapshot', payload: tokens });
    // broadcast recent inscribes newest first
    recent.reverse().forEach(r => broadcastJSON({ type: 'new_inscribe', payload: r }));

  } catch (e) {
    console.error('indexerLoop error', e);
  }
}

// loop every 10s
setTimeout(() => {
  (async function loop() {
    try { await indexerLoop(); } catch (e) { console.error('indexerLoop err', e); }
    setTimeout(loop, 10000);
  })();
}, 2000);

// --- REST API ---
app.get('/api/tokens', (req, res) => {
  const tokens = db.prepare('SELECT tick,maxSupply,limitPerMint,minted,deployer,holdersCount,deployedAt FROM tokens ORDER BY deployedAt DESC').all();
  res.json(tokens);
});
app.get('/api/inscribes', (req, res) => {
  const recent = db.prepare('SELECT blockNumber,user,tick,operation,amount,data,inscriptionNumber,time FROM inscribes ORDER BY blockNumber DESC LIMIT 500').all();
  res.json(recent);
});
app.get('/api/meta', (req, res) => { res.json({ lastSyncedBlock: getMeta('lastSyncedBlock', 0) }); });

// health (await block number)
app.get('/api/health', async (req, res) => {
  try {
    const block = await provider.getBlockNumber();
    res.json({ ok: true, block });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

server.listen(PORT, () => console.log('Server listening on', PORT));

wss.on('connection', ws => {
  console.log('ws conn');
  // send current snapshot immediately
  const tokens = db.prepare('SELECT tick,maxSupply,limitPerMint,minted,deployer,holdersCount,deployedAt FROM tokens ORDER BY deployedAt DESC').all();
  ws.send(JSON.stringify({ type: 'tokens_snapshot', payload: tokens }));
});
