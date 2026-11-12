# Scout on Windows with Gemini and Aternos

This is a one-agent setup for the harness in this repository. It uses Google's
Gemini API, connects to a server you start yourself, and disables the
agent's local shell tool. It does not need a local model, Docker, or a local
Minecraft server. Gemini API usage may be billed or rate-limited according to
your Google account and current API terms.

## What is supported

- The harness uses Mineflayer and accepts an external Java server host, port,
  explicit Minecraft protocol version, and either offline or Microsoft
  authentication. `minecraftVersion: "auto"` asks Mineflayer to negotiate the
  server version.
- Scout uses the built-in `google` provider and `google/gemini-2.5-flash`.
  The provider reads `GEMINI_API_KEY` from `.env`; no custom model file or base
  URL is needed.
- Scout's harness session and state are stored in `.agent-state/Scout/`.
  The objective asks it to use the durable single-agent plan notes for locations
  and progress; session history is resumed after restart. This is persistent
  history, not model training or guaranteed long-term learning.
- Harness telemetry and diagnostics are JSON Lines files in Scout's state
  directory. `sandbox: "none"` removes `run_shell`. The secure workspace-file
  tools require Linux descriptor paths and are unavailable on native Windows;
  `compute_js` is part of that tool bundle and is also unavailable. Use the
  built-in plan tools for Scout's notes. Game tools remain available.

The harness's own bundled Paper server is not used. Java is needed only if you
choose to run that local development server; it is not required for this
external-server setup.

## Install and configure

1. Install [Node.js 22.19 or newer](https://nodejs.org/en/download/). This
   repository declares `>=22.19`; Node 24 is also compatible.
2. Create a Gemini API key in
   [Google AI Studio](https://aistudio.google.com/apikey). Copy it into your
   local `.env` as `GEMINI_API_KEY=...`. Do not send the key in chat or commit
   it to the repository.

3. From the repository directory, install the locked Node dependencies:

   ```powershell
   npm ci
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

4. In `.env`, set `MC_HOST` and `MC_PORT` to the current address and port
   displayed by your Aternos server page. Aternos addresses and ports can
   change; do not assume port 25565. Keep `MC_VERSION=auto` unless negotiation
   fails; use only the exact Java version reported by the server, not a guessed
   protocol version.
5. This Scout example uses `auth: "offline"` and `name: "Scout"`. Set
   `MC_AUTH=offline` in `.env` too, if present: environment settings override
   the JSON file. This mode is appropriate only because the owner has
   explicitly configured the server for offline-mode clients. It needs no
   Microsoft sign-in, password, or token. It will not join an online-mode
   server or bypass server authentication or access controls.
6. Use this only on a server you own or have explicit permission to access.
   Offline mode does not verify usernames; another client could claim `Scout`,
   so do not treat a name-based allow-list as identity verification. Confirm
   that the server owner and Aternos' current rules permit your setup. Do not
   use a proxy or alternate address to evade a queue, allow-list, ban, or
   authentication requirement.
7. Start the server yourself in Aternos. Wait for Aternos to finish its normal
   startup process, then run:

   ```powershell
   .\scripts\start-scout.ps1
   ```

   The script checks Node, Gemini model configuration and key presence, and the
   server's TCP port. It waits up to 10 minutes for the address in `.env`, then starts Scout.
   It does not start Aternos, change server settings, or bypass a queue. Stop
   Scout with `Ctrl+C`.

The full agent config is [`examples/scout.json`](../examples/scout.json). Edit
that file to change the objective/model; keep the API key and Aternos endpoint
in `.env`.

## Aternos and free-service limits

Aternos hosts the Minecraft server, not the model. The server must be started
by you and available at the address/port it currently displays. Availability
of offline/cracked mode can depend on the server software and current hosting
settings; the owner must enable it through the normal Aternos controls. This
setup does not automate Aternos login/startup, hold a server open while
unattended, or evade its queue, authentication, idle behavior, or usage
policies. Confirm that automated clients and the selected server settings are
permitted by current Aternos and server-owner rules; stop if disallowed.

The harness has bounded reconnect behavior for ordinary disconnects. It stops
on authentication, allow-list, ban, duplicate-login, and other fatal kicks.
If the server shuts down, start it normally and rerun Scout after the startup
script's wait. A reconnect loop is not a way to restart a stopped Aternos
server.

Gemini requests are sent to Google's API using the key in `.env`. Quotas,
availability, pricing, and data handling depend on Google's current API terms
and your account; check those terms before running Scout. The launcher checks
that the provider, model, and key are configured, but does not make a billable
test request.

### Context and rate-limit handling

Scout resumes its persisted session; it does not delete old messages. Before
each model request, the harness keeps the latest bounded conversation window
and adds a compact continuity summary with the objective, current survival
state, completed work, important locations, and recent action/plan. Older
observations are not replayed. Each decision still gets a fresh observation;
the default survey range is 12 blocks, with nearby hostile entities prioritized.

Gemini 429 responses are categorized. The harness honors `Retry-After` when
available, otherwise uses exponential backoff with jitter, and stops after a
bounded number of retries. Daily-quota errors wait 24 hours between retries.
Scout keeps its Minecraft session during these waits. Diagnostics record the
error category and retry count. `telemetry.jsonl` records request duration,
tool/observation counts, and context character counts; input/output token
counts are recorded only when the provider supplies them. The context character
counts are not provider token counts.

## Verify the setup

For a configuration/provider check without connecting to Minecraft, run:

```powershell
node --input-type=module -e "import {readConfigFile,resolveConfig,fromEnv} from './src/config.js'; import {checkModel} from './src/startup.js'; const config=resolveConfig([readConfigFile('examples/scout.json'),fromEnv(process.env)],{cwd:process.cwd(),env:process.env,probeDocker:()=>false}); const problem=await checkModel(config); if(problem) throw new Error(problem); console.log('Scout model configuration is valid.');"
```

This confirms the SDK recognizes the Gemini model and finds a configured key; it
does not validate the key with a remote request. A real Minecraft join/action
test requires an online Aternos server, a valid address/port, and an authorized
Minecraft account.

## Troubleshooting

| Symptom                                      | What to check                                                                                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Node.js 22.19 or newer is required`         | Install a supported Node.js version and open a new PowerShell window.                                                                                                                                       |
| `Dependencies are missing`                   | Run `npm ci` in the repository root.                                                                                                                                                                        |
| Gemini API key is missing                   | Set `GEMINI_API_KEY` in `.env`; never commit it or send it in chat.                                                                                                                                         |
| Gemini returns an authentication/API error  | Check the key in Google AI Studio, account/API access, quotas, and current Google API terms. The launcher never displays the key; Scout sends it to Google for authenticated model requests.                 |
| Server wait times out                        | Start the Aternos server manually and copy its current address and port exactly. Do not use the Aternos website URL or assume port 25565.                                                                   |
| Microsoft sign-in prompt                     | Set `auth` in `examples/scout.json` and `MC_AUTH` in `.env` to `offline`; environment settings take precedence.                                                                                             |
| `outdated client/server` or protocol error   | Keep `MC_VERSION=auto`; see the protocol note below. Do not guess a version or update dependencies blindly.                                                                                                 |
| Online-mode sign-in or invalid-session error | Offline auth cannot join an online-mode server. Confirm the server's authentication setting with its owner; do not give Scout a password or token.                                                          |
| Whitelist/ban/duplicate-login kick           | Ask the server owner to resolve it. The harness deliberately does not retry fatal kicks.                                                                                                                    |
| Workspace tools unavailable on Windows       | This is expected: the current secure filesystem tools use Linux descriptor paths. Scout's plan notes and saved model session remain available.                                                              |
| Bot joins but model call fails               | Check `GEMINI_API_KEY`, the `google/gemini-2.5-flash` model reference, and the provider error in Scout's diagnostics.                                                                                       |
| Scout acts slowly or makes poor decisions    | Reduce the objective scope and check `.agent-state/Scout/diagnostics.jsonl`; model behavior can vary.                                                                                                       |
| Server stops or Scout gives up reconnecting  | Restart the server yourself and rerun the script. It will wait for the TCP port before launching.                                                                                                           |

For Java `26.1.2`, the inspected `minecraft-data` metadata identifies protocol
775; the installed `minecraft-protocol` supports that protocol family as
`26.1` and can initialize its serializers for the `26.1.2` metadata. This is
library-level evidence, not proof of a successful server join or complete
Mineflayer behavior. Keep `MC_VERSION=auto`, capture the full error, and verify
the server's reported version and software before changing anything. Do not
fake a server version or substitute a guessed one.

For detailed tool semantics and configuration options, see
[`configuration.md`](configuration.md) and [`tools.md`](tools.md).

## References

- [Harness README](../README.md) and [harness configuration](configuration.md)
- [Google AI Studio API keys](https://aistudio.google.com/apikey)
- [Gemini API documentation](https://ai.google.dev/gemini-api/docs)
- [Mineflayer documentation](https://github.com/PrismarineJS/mineflayer)
- [Aternos help center](https://support.aternos.org/)
- [Mindcraft upstream repository](https://github.com/mindcraft-bots/mindcraft)
