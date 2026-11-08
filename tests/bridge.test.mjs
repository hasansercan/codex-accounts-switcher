import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
test(
  "Yerel köprü: çoklu hesap, resmî RPC, geçiş, kayıt ve gizli veri koruması",
  { skip: process.platform === "win32" ? "POSIX executable fixtures" : false },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "accounts-integration-")),
      home = join(dir, "codex-home"),
      store = join(dir, "store");
    await mkdir(join(home, "accounts"), { recursive: true });
    const initial = {
      accounts: [
        {
          account_key: "user::a",
          email: "one@example.test",
          plan: "plus",
          auth_mode: "chatgpt",
          active: true,
          usage: {},
        },
        {
          account_key: "user::b",
          email: "two@example.test",
          plan: "plus",
          auth_mode: "chatgpt",
          active: false,
          usage: {},
        },
      ],
    };
    await writeFile(join(home, "fixture.json"), JSON.stringify(initial));
    for (const id of ["a", "b"])
      await writeFile(
        join(
          home,
          "accounts",
          Buffer.from("user::" + id).toString("base64url") + ".auth.json",
        ),
        JSON.stringify({
          tokens: {
            account_id: id,
            access_token: "SECRET-" + id,
            refresh_token: "SECRET-refresh",
          },
        }),
      );
    const fakeAuth = join(dir, "fake-auth"),
      fakeCodex = join(dir, "fake-codex");
    await writeFile(
      fakeAuth,
      `#!${process.execPath}\nconst fs=require('fs'),p=require('path').join(process.env.CODEX_HOME,'fixture.json'),s=JSON.parse(fs.readFileSync(p)),a=process.argv.slice(2);if(a[0]==='list')console.log(JSON.stringify(s));else if(a[0]==='switch'){if(!s.accounts.find(x=>x.account_key===a[1]))process.exit(1);s.accounts.forEach(x=>x.active=x.account_key===a[1]);fs.writeFileSync(p,JSON.stringify(s));console.log('{}')}else if(a[0]==='alias'){s.accounts.find(x=>x.account_key===a[2]).alias=a[3];fs.writeFileSync(p,JSON.stringify(s));console.log('saved')}else if(a[0]==='remove'){s.accounts=s.accounts.filter(x=>x.account_key!==a[1]);fs.writeFileSync(p,JSON.stringify(s));console.log('{}')}else process.exit(1);`,
      { mode: 0o700 },
    );
    await writeFile(
      fakeCodex,
      `#!${process.execPath}\nconst fs=require('fs'),p=require('path'),rl=require('readline');const authFile=p.join(process.env.CODEX_HOME,'auth.json');const a=fs.existsSync(authFile)?JSON.parse(fs.readFileSync(authFile)).tokens.account_id:'login';rl.createInterface({input:process.stdin}).on('line',line=>{const x=JSON.parse(line);if(x.id===undefined)return;let result={};if(x.method==='account/read')result={account:{type:'chatgpt',email:a+'@example.test',planType:'plus'}};if(x.method==='account/rateLimits/read')result={accountId:a,ordinaryUsageAllowed:true,rateLimits:{primary:{usedPercent:a==='a'?99:5,windowDurationMins:300,resetsAt:2000000000},secondary:{usedPercent:10,windowDurationMins:10080,resetsAt:2000100000},rateLimitReachedType:null},rateLimitsByLimitId:null,rateLimitResetCredits:{availableCount:a==='a'?2:0,credits:a==='a'?[{id:'credit1',resetType:'codexRateLimits',status:'available',grantedAt:1791000000,expiresAt:1792000000,title:'Reset'}]:[]}};if(x.method==='account/usage/read'){if(a==='b'){console.log(JSON.stringify({id:x.id,error:{code:-32000,message:'network timeout'}}));return;}result={summary:{lifetimeTokens:1500,peakDailyTokens:500,currentStreakDays:null},dailyUsageBuckets:[{startDate:'2026-10-08',tokens:250}]};}if(x.method==='account/login/start')result={loginId:'fixture-login',authUrl:'https://auth.openai.com/oauth/authorize?state=fixture',type:'chatgpt'};console.log(JSON.stringify({id:x.id,result}));});`,
      { mode: 0o700 },
    );
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../src/bridge.mjs", import.meta.url))],
      {
        env: {
          ...process.env,
          ACCOUNTS_AUTH: fakeAuth,
          ACCOUNTS_CODEX: fakeCodex,
          ACCOUNTS_HOME: home,
          ACCOUNTS_STORE: store,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let id = 0,
      pending = new Map(),
      allOutput = "",
      latest;
    createInterface({ input: child.stdout }).on("line", (line) => {
      allOutput += line;
      const v = JSON.parse(line);
      if (v.state) latest = v.state;
      if (pending.has(v.id)) {
        const c = pending.get(v.id);
        pending.delete(v.id);
        v.error ? c.reject(Error(v.error.message)) : c.resolve(v.result);
      }
    });
    const call = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const num = ++id;
        pending.set(num, { resolve, reject });
        child.stdin.write(JSON.stringify({ id: num, method, params }) + "\n");
      });
    const timer = setTimeout(() => child.kill(), 20000);
    try {
      const state = await call("state");
      assert.equal(state.accounts.length, 2);
      assert.equal(state.accounts[0].source, "official");
      assert.equal(state.accounts[0].primary.used, 99);
      assert.equal(state.settings.autoEnabled, false);
      assert.equal(state.accounts[0].resetCredits, 2);
      const detail = await call("details", { key: "user::a" });
      assert.equal(detail.accounts[0].history.summary.lifetimeTokens, 1500);
      assert.equal(detail.accounts[0].resetDetails[0].expiresAt, 1792000000);
      const failedHistory = await call("details", { key: "user::b" });
      const b = failedHistory.accounts.find((a) => a.id === "user::b");
      assert.equal(b.primary.used, 5);
      assert.equal(b.error, null);
      assert.ok(b.historyError);
      const login = await call("login", { openBrowser: false });
      assert.equal(
        login.login.url,
        "https://auth.openai.com/oauth/authorize?state=fixture",
      );
      assert.equal(login.login.browserPid, null);
      assert.equal(login.login.status, "waiting");
      assert.ok(login.login.message.includes("kopyalayıp"));
      await call("cancelLogin");
      assert.equal((await call("state")).login.status, "cancelled");
      assert.equal((await stat(store)).mode & 0o777, 0o700);
      assert.equal(
        (await stat(join(store, "usage-cache.json"))).mode & 0o777,
        0o600,
      );
      const auto = await call("settings", { autoEnabled: true });
      assert.equal(auto.pendingAuto.key, "user::b");
      await call("snooze");
      assert.equal((await call("state")).pendingAuto, null);
      await assert.rejects(call("switch", { key: "unrecognized" }));
      await call("switch", { key: "user::b" });
      assert.equal(
        (await call("state")).accounts.find((a) => a.active).id,
        "user::b",
      );
      await call("alias", { key: "user::b", alias: "Work" });
      assert.equal(
        (await call("state")).accounts.find((a) => a.id === "user::b").alias,
        "Work",
      );
      await assert.rejects(call("remove", { key: "user::b" }));
      await call("remove", { key: "user::a" });
      assert.equal((await call("state")).accounts.length, 1);
      assert.ok(!allOutput.includes("SECRET"));
      assert.ok(
        !(await readFile(join(store, "usage-cache.json"), "utf8")).includes(
          "SECRET",
        ),
      );
    } finally {
      clearTimeout(timer);
      child.stdin.end();
      await new Promise((r) => child.once("exit", r));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
