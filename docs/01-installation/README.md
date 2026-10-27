# 01 · Installation

Choose a local preview to explore the interface, or deploy the gateway on a VPS for your team. RelayCrew requires Node.js 20 or newer. The gateway has no runtime npm dependencies.

## Try the dashboard locally

Run these commands in a terminal:

```bash
git clone https://github.com/sep1ol/relaycrew.git
cd relaycrew
npm run preview
```

Open `http://localhost:43190/dashboard`. The terminal prints a protected temporary configuration path. Use the administrator key from that local configuration to sign in.

The preview supplies synthetic provider accounts, members, and history. It uses a local fake upstream and does not import your provider credentials. Keep the terminal running while exploring. Ctrl+C stops the preview and removes its temporary configuration.

See the [dashboard tour](../04-dashboard/README.md) for the screens and controls.

## Deploy the team gateway

Follow the [complete VPS deployment tutorial](../teams.md). It covers two installations:

- [Node.js with systemd](../teams.md#2a-install-nodejs-and-systemd).
- [Docker Compose](../teams.md#2b-install-with-docker-compose).

Both keep the gateway port on loopback and store credentials in private persistent data. The tutorial then covers provider login, [HTTPS or an SSH tunnel](../teams.md#3-connect-through-ssh-or-https), and [gateway verification](../teams.md#4-verify-the-gateway-and-dashboard).

Use the tutorial's service-user commands throughout. Running a bare CLI command as another user can select another configuration file.

---

[Previous · Introduction](../00-introduction/README.md) · [Documentation index](../README.md) · [Next · Provider Accounts](../02-provider-accounts/README.md)
