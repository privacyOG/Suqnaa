# Architecture

Suqnaa is structured as a monorepo with separate applications for API, web, and mobile clients.

## Applications

- `apps/api`: HTTP API built with Fastify and TypeScript.
- `apps/web`: marketplace website built with Next.js.
- `apps/mobile`: Android and iOS application built with Flutter.
- `packages/shared`: shared constants and type contracts.

## Data model

PostgreSQL is the primary database because marketplace data needs strong consistency, relational constraints, indexing, and durable transaction records. PostGIS is included for location-based search and nearby listings.

Redis is used for rate limits, short-lived operational state, and future background queues. Listing media is stored in object storage rather than inside the database.

## Security posture

The platform separates identity, listings, media, messages, offers, transactions, reports, and audit logs. Sensitive flows should always use server-side validation, rate limits, and audit events.

## Brand provision

The current logo and app icon are isolated in brand assets and brand token files. They can be replaced later without changing the platform architecture.
