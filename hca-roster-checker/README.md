# HCA Roster Checker (MVP)

Admin-first roster and match validation app for Hell Let Loose HCA tournaments.

## Stack

- Next.js App Router + TypeScript
- PostgreSQL + Prisma ORM
- Tailwind CSS
- CSV upload/parsing via API route handlers

## Features in this MVP

- Team management
- Team roster upload (CSV paste or file)
- Steam ID normalization to SteamID64
- Roster validation (invalid IDs, duplicates, placeholder account-age risk)
- Roster lock/unlock
- Match creation and match stats upload (CSV)
- Unregistered match player detection
- Violation workflow (open, dismissed, confirmed)
- Audit log records for major admin actions

## Authentication and Roles

The app supports exactly two login types:

- `HCA_ORGA`: full access to every team, every violation, and match administration
- `TEAM_REP`: can submit/manage only their team roster and can only view their own team violations

Login page is available at `/login`.

## Setup

1. Copy [.env.example](.env.example) to `.env` and set both `DATABASE_URL` and `AUTH_SECRET`.
2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client and push schema:

```bash
npm run prisma:generate
npx prisma db push
```

4. Seed sample data:

```bash
npm run seed
```

Seed includes default login accounts:

- HCA ORGA: `orga@hca.local` / `ChangeMeNow123!`
- Team Rep: `rep@hca.local` / `ChangeMeNow123!`

Change these passwords immediately outside local development.

5. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run prisma:migrate`
- `npm run prisma:migrate:deploy`
- `npm run prisma:studio`
- `npm run prisma:generate`
- `npm run seed`
- `npm run start:prod`

## Discord Notes

Discord bot/OAuth is intentionally not implemented in this MVP.

- `Team` stores optional `discordRoleId` and `discordChannelId` for future use.
- Notification behavior is stubbed behind [src/lib/notifications/notifications.ts](src/lib/notifications/notifications.ts).

## Railway Deployment Walkthrough

Use this flow when [HCA-Roster/hca-roster-checker](.) is already its own repository.

1. Push your latest code to the default branch in your Git provider.

2. In Railway, create a new project.

3. Add PostgreSQL:
	- Click `+ New` -> `Database` -> `Add PostgreSQL`.
	- Wait until the Postgres service is provisioned.

4. Add your web service from GitHub/GitLab:
	- Click `+ New` -> `GitHub Repo` (or your provider).
	- Select your `hca-roster-checker` repository.

5. Configure service environment variables:
	- Open the web service -> `Variables`.
	- Add `DATABASE_URL` and set it to `${{Postgres.DATABASE_URL}}` by selecting the Postgres reference variable in Railway UI.
	- Add `AUTH_SECRET` and use a long random secret.
	- Optional: add `NODE_ENV=production`.

6. Configure deploy/start commands in service `Settings`:
	- Build Command: `npm run build`
	- Start Command: `npm run start:prod`

	`start:prod` runs `prisma db push` before `next start` so schema changes apply automatically.

7. Trigger first deploy:
	- Go to `Deployments` and click `Deploy` (or push a commit).
	- Wait for logs to show successful build and startup.

8. Generate a public domain:
	- Open service `Settings` -> `Domains`.
	- Click `Generate Domain`.

9. Verify app health:
	- Open the generated URL.
	- Visit `/dashboard`, `/teams`, and `/violations`.

10. Seed sample data (optional, one-time):
	 - In Railway web service, open a shell/terminal session.
	 - Run: `npm run seed`

### Notes

- If you use preview environments, ensure each environment is linked to a Postgres instance and has `DATABASE_URL` set.
- `npm run start:prod` is safe to run repeatedly; `prisma db push` updates the schema to match Prisma models.
