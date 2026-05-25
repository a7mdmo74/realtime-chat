# Realtime Chat Docs Portal

This app provides a frontend docs UI for the backend API so Web and React Native work can move in parallel.

It links to and reads docs from the running server:
- Swagger UI
- OpenAPI JSON/YAML
- Postman collection

## Prerequisites
- Server app running (default: `http://localhost:3000`)

## Configuration
Create `apps/docs/.env.local` from the example:

```bash
cp .env.example .env.local
```

Default value:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

## Run

```bash
npm run dev
```

Open `http://localhost:3001`.

## Useful links
- Docs UI: `http://localhost:3001`
- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs/openapi.json`
- Postman collection: `http://localhost:3000/api/docs/postman-collection.json`
