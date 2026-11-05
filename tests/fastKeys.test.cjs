const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { createKeyWorker, WORKER } = require('../electron/native/fastKeys.cjs');

function mockProcess() {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.commands = [];
  child.stdin = new Writable({ write(chunk, _encoding, done) { child.commands.push(JSON.parse(chunk.toString())); done(); } });
  child.kill = () => { child.killed = true; };
  child.reply = data => child.stdout.write(JSON.stringify(data) + '\n');
  return child;
}
(async () => {
  let processes = [];
  const worker = createKeyWorker({ spawnProcess: (file, args, opts) => {
    assert.equal(file, 'powershell.exe'); assert(args.includes('-STA')); assert(opts.windowsHide);
    assert.equal(Buffer.from(args.at(-1),'base64').toString('utf16le'), WORKER);
    const child=mockProcess(); processes.push(child); return child;
  }, timeoutMs: 1000 });
  worker.start(); worker.start(); assert.equal(processes.length,1,'prewarm starts just one helper');
  const first = worker.send({kind:'keys',events:[{vk:65,flags:0},{vk:65,flags:2}]});
  const second = worker.send({kind:'text',text:"hello ' $(bad)"});
  const c=processes[0]; assert.equal(c.commands.length,0,'no command before readiness');
  c.reply({ready:true}); assert.equal(c.commands.length,1,'one request at a time');
  assert.deepEqual(c.commands[0].events,[{vk:65,flags:0},{vk:65,flags:2}]);
  c.reply({id:c.commands[0].id,success:true}); assert.equal((await first).success,true);
  assert.equal(c.commands.length,2); assert.equal(c.commands[1].text,"hello ' $(bad)", 'text is data, not PowerShell code');
  c.reply({id:c.commands[1].id,success:true}); assert.equal((await second).success,true);
  assert.equal(processes.length,1,'repeated keys reuse the same process');
  const third=worker.send({kind:'keys',events:[{vk:66,flags:0}]});
  const queued=worker.send({kind:'keys',events:[{vk:67,flags:0}]});
  assert.equal(c.commands.length,3);
  c.emit('close',1);
  assert.match((await third).error,/may have been sent/); assert.match((await queued).error,/was not sent/);
  assert.equal(c.commands.length,3,'never replay an uncertain action');
  const next=worker.send({kind:'keys',events:[{vk:68,flags:0}]});
  assert.equal(processes.length,2,'a later request starts a fresh helper');
  processes[1].reply({ready:true}); processes[1].reply({id:processes[1].commands[0].id,success:true});
  assert.equal((await next).success,true);
  worker.stop(); assert.equal(processes[1].killed,true);
  assert.match((await worker.send({kind:'keys'})).error,/shutting down/);

  let stalled; const timed = createKeyWorker({spawnProcess:()=>stalled=mockProcess(),timeoutMs:25,maxQueue:2});
  const one=timed.send({kind:'keys'}), two=timed.send({kind:'keys'});
  assert.match((await timed.send({kind:'keys'})).error,/queue is full/);
  stalled.reply({ready:true});
  assert.match((await one).error,/may have been sent/); assert.match((await two).error,/was not sent/);
  assert.equal(stalled.commands.length,1); assert.equal(stalled.killed,true); timed.stop();
  const independent = [];
  const slow=createKeyWorker({spawnProcess:()=>{const c=mockProcess();independent.push(c);return c;},timeoutMs:1000});
  const quick=createKeyWorker({spawnProcess:()=>{const c=mockProcess();independent.push(c);return c;},timeoutMs:1000});
  const pendingDisplay=slow.send({kind:'brightness',up:true});
  const pendingKey=quick.send({kind:'keys',events:[]});
  independent[0].reply({ready:true}); independent[1].reply({ready:true});
  independent[1].reply({id:independent[1].commands[0].id,success:true});
  assert.equal((await pendingKey).success,true, 'waiting for a display never blocks the keyboard worker');
  independent[0].reply({id:independent[0].commands[0].id,success:true,level:70});
  assert.equal((await pendingDisplay).level,70);
  slow.stop(); quick.stop();
  let malformed; const bad=createKeyWorker({spawnProcess:()=>malformed=mockProcess(),timeoutMs:1000});
  const failed=bad.send({kind:'keys'}); malformed.reply({ready:true}); malformed.stdout.write('not json\n');
  assert.match((await failed).error,/may have been sent/); assert.equal(malformed.killed,true); bad.stop();
  let neverReady; const startup=createKeyWorker({spawnProcess:()=>neverReady=mockProcess(),timeoutMs:25});
  const waiting=startup.send({kind:'keys'}); assert.match((await waiting).error,/was not sent/);
  assert.equal(neverReady.commands.length,0); startup.stop();
  console.log('fastKeys: prewarm, ordering, reuse, text safety, crash and timeout handling passed');
})().catch(e=>{console.error(e);process.exitCode=1});
