import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { GatewayClient, RetryablePaste, resolveGateway } from './gateway-client.js';
import { isRemoteSession, openBrowser } from './login-flow.js';
import { safeLine } from './safe-text.js';

/** @typedef {{action: 'login', provider: import('./member-logins.js').LoginProvider, sharing: import('./owned-accounts.js').Sharing}
 * |{action: 'accounts'}
 * |{action: 'share', id: string, sharing: import('./owned-accounts.js').Sharing}
 * |{action: 'disable'|'enable'|'remove', id: string}} MemberCommand */

const USAGE = [
  'Usage: relaycrew member accounts',
  '       relaycrew member login --claude|--codex|--grok --private|--pool',
  '       relaycrew member disable|enable|remove <account-id>',
  '       relaycrew member share <account-id> --private|--pool',
  '',
  'All commands accept --gateway <http(s) URL> and --key <member key>.',
  'Gateway: --gateway > RELAYCREW_GATEWAY > ANTHROPIC_BASE_URL.',
  'Key: --key > RELAYCREW_KEY > TEAM_GATEWAY_KEY > ANTHROPIC_AUTH_TOKEN > hidden prompt.',
].join('\n');

/** @param {string[]} args @returns {MemberCommand} */
function parseCommand(args) {
  const positional = [];
  const flags = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--gateway' || arg === '--key') {
      if (flags.has(arg) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(USAGE);
      flags.add(arg);
      i++;
    } else if (['--claude', '--codex', '--grok', '--private', '--pool'].includes(arg)) {
      if (flags.has(arg)) throw new Error(USAGE);
      flags.add(arg);
    } else if (arg.startsWith('-')) throw new Error(USAGE);
    else positional.push(arg);
  }
  const [action, id] = positional;
  const providers = ['--claude', '--codex', '--grok'].filter(flag => flags.has(flag));
  const sharing = ['--private', '--pool'].filter(flag => flags.has(flag));
  if (action === 'login') {
    if (positional.length !== 1 || providers.length !== 1 || sharing.length !== 1) throw new Error(USAGE);
  } else if (action === 'share') {
    if (positional.length !== 2 || providers.length || sharing.length !== 1) throw new Error(USAGE);
  } else if (action === 'accounts') {
    if (positional.length !== 1 || providers.length || sharing.length) throw new Error(USAGE);
  } else if (!['disable', 'enable', 'remove'].includes(action) || positional.length !== 2 || providers.length || sharing.length) throw new Error(USAGE);
  return /** @type {MemberCommand} */ ({
    action: /** @type {MemberCommand['action']} */ (action), id,
    provider: /** @type {import('./member-logins.js').LoginProvider} */ (providers[0]?.slice(2)),
    sharing: /** @type {import('./owned-accounts.js').Sharing} */ (sharing[0]?.slice(2)),
  });
}

/** @param {NodeJS.ReadStream} input @param {NodeJS.WriteStream} output */
function terminalLines(input, output) {
  // A muted output keeps readline's editing and Ctrl-C handling without echoing secrets.
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const rl = createInterface({ input, output: muted, terminal: Boolean(input.isTTY) });
  rl.on('SIGINT', () => rl.close());
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask(/** @type {string} */ prompt) {
      output.write(prompt);
      const answer = await lines.next();
      output.write('\n');
      return answer.done ? null : answer.value;
    },
    close() { rl.close(); muted.end(); },
  };
}

/** @param {string[]} args
 * @param {{client?: GatewayClient|null, input?: NodeJS.ReadStream, output?: NodeJS.WriteStream,
 * open?: (url: string) => void, env?: NodeJS.ProcessEnv}} [opts] */
export async function memberCommand(args, { client = null, input = process.stdin, output = process.stdout, open = openBrowser, env = process.env } = {}) {
  const print = (/** @type {string} */ line) => output.write(`${line}\n`);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { print(USAGE); return; }
  const command = parseCommand(args);
  /** @type {{terminal?: ReturnType<typeof terminalLines>}} */
  const state = {};
  const ask = (/** @type {string} */ prompt) => (state.terminal ??= terminalLines(input, output)).ask(prompt);
  try {
    if (!client) {
      const resolved = resolveGateway(args, env);
      if (!resolved.baseUrl) throw new Error('A gateway URL is required (--gateway or RELAYCREW_GATEWAY).');
      const key = resolved.key ?? await ask('Member key (hidden): ');
      if (!key) throw new Error('A member key is required.');
      client = new GatewayClient({ baseUrl: resolved.baseUrl, key });
    }
    if (command.action === 'accounts') {
      const { accounts } = await client.accounts();
      if (!accounts.length) { print('No accounts. Add one with relaycrew member login --claude --private.'); return; }
      print('ID\tPROVIDER\tNAME\tSHARING\tSTATE');
      for (const account of accounts) print([account.id, account.provider, account.name, account.sharing, account.disabled ? (account.disabledBy === 'admin' ? 'disabled by admin' : 'disabled') : 'active'].map(value => safeLine(value, 200)).join('\t'));
      return;
    }
    if (command.action === 'login') {
      const { login } = await client.startLogin(command.provider, command.sharing);
      let completed = false;
      try {
        print(login.paste === 'none' ? 'Open this link and confirm the code in your browser:' : 'Open this link, sign in, and paste the result here:');
        print(safeLine(login.url, 8192));
        if (login.paste === 'none') print(`Code: ${safeLine(login.userCode, 100)}\nWaiting for authorization...`);
        if (login.paste === 'callback-url') print('Copy the full localhost:1455/auth/callback address from the page that does not load.');
        if (!isRemoteSession(env)) open(login.url);
        while (true) {
          const text = login.paste === 'none' ? undefined : await ask(login.paste === 'callback-url' ? 'Paste the callback address: ' : 'Paste the code: ');
          if (text === null) { print('Login cancelled.'); return; }
          try {
            const result = await client.completeLogin(login.id, text);
            if (result.pending === true) continue;
            completed = true;
            const account = result.account;
            print(`${result.action === 'added' ? 'Added' : 'Updated'} "${safeLine(account.name, 200)}" (${account.provider}, ${account.sharing}) as ${account.id}.`);
            if (result.warning) print(safeLine(result.warning, 500));
            return;
          } catch (error) {
            if (!(error instanceof RetryablePaste)) throw error;
            print(error.message);
          }
        }
      } finally {
        if (!completed) await client.cancelLogin(login.id).catch(() => {});
      }
    }
    const result = command.action === 'remove'
      ? await client.remove(command.id)
      : await client.update(command.id, command.action === 'share' ? { sharing: command.sharing } : { disabled: command.action === 'disable' });
    print(command.action === 'remove' ? `Removed ${result.removed}.` : `Updated "${safeLine(result.account.name, 200)}" (${result.account.sharing}, ${result.account.disabled ? 'disabled' : 'active'}).`);
    if (result.warning) print(safeLine(result.warning, 500));
  } finally {
    state.terminal?.close();
  }
}
