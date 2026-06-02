# HCA Roster Checker

Admin-first roster and match validation app for Hell Let Loose HCA tournaments.

## Stack

- Next.js App Router + TypeScript
- PostgreSQL + Prisma ORM
- Tailwind CSS
- CSV upload/parsing via API route handlers

## Authentication and Roles

The app supports exactly two login types:

- `HCA_ORGA`: full access to every team, violations, and match administration
- `TEAM_REP`: can only manage/submit their own team roster and view only their own team violations

Login is username + password at `/login`.

### Root Admin and Default Account

The system auto-creates a default root admin account on login attempts if it does not exist.

Environment variables:

- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`
- `DEFAULT_ADMIN_DISPLAY_NAME`
- `ROOT_ORGA_USERNAME`

Defaults:

- username: `MILK`
- password: `C0nn0rSucks!`
- display name: `MILK`
- root ORGA username: `MILK`

Only the root account (`ROOT_ORGA_USERNAME`) can create new HCA ORGA accounts.

## Setup

1. Copy [.env.example](.env.example) to `.env` and set `DATABASE_URL` and `AUTH_SECRET`.
2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client and push schema:

```bash
npm run prisma:generate
npx prisma db push
```

4. Optional seed data:

```bash
npm run seed
```

Seed default logins:

- HCA ORGA: `MILK` / `ChangeMeNow123!`
- Team Rep: `ABLE_REP` / `ChangeMeNow123!`

5. Start app:

```bash
npm run dev
```

## Account Management via UI

### Team Rep accounts

- `/admin/team-reps`
- HCA_ORGA can create/delete Team Rep accounts

### HCA ORGA accounts

- `/admin/orga-accounts`
- only root account (`MILK` by default) can create HCA ORGA accounts

## Railway Notes

Required variables for Railway app service:

- `DATABASE_URL`
- `AUTH_SECRET`
- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`
- optional `DEFAULT_ADMIN_DISPLAY_NAME`
- optional `ROOT_ORGA_USERNAME`

Use:

- Build: `npm run build`
- Start: `npm run start:prod`

`start:prod` runs `prisma db push` before `next start`.
