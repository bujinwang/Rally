/**
 * Opaque keyset-pagination cursor helpers (Story 6.8, decision D3).
 *
 * A feed cursor encodes the `(createdAt, id)` ordering tuple of the last row on
 * the previous page. It is *opaque* to clients: they receive it in `nextCursor`
 * and echo it back verbatim as `?cursor=...`. The encoding is URL-safe base64
 * (`base64url`) of `"<createdAt ISO>|<id>"`, so the token survives a query
 * string without percent-encoding and never contains `+`, `/` or `=`.
 *
 * `decodeCursor` is total: any malformed input returns `null` rather than
 * throwing, so a corrupt or foreign cursor degrades to offset-based pagination
 * instead of failing the whole request.
 */

export interface FeedCursor {
  /** `createdAt` of the last row on the previous page (ordering key, primary). */
  createdAt: Date;
  /** `id` of the last row on the previous page (ordering key, tie-breaker). */
  id: string;
}

/**
 * Encode the ordering tuple of a feed row into an opaque, URL-safe cursor.
 *
 * @param createdAt - The row's `createdAt` (primary ordering key, DESC).
 * @param id - The row's `id` (tie-breaker ordering key, DESC).
 * @returns A URL-safe opaque token safe to embed in a query string verbatim.
 */
export function encodeCursor(createdAt: Date, id: string): string {
  const raw = `${createdAt.toISOString()}|${id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

/**
 * Decode an opaque cursor. Accepts the URL-safe form we emit as well as a
 * standard base64 form (tolerant of clients/proxies that normalise the token).
 *
 * @param cursor - The opaque token from the `cursor` query parameter.
 * @returns The decoded `(createdAt, id)` tuple, or `null` when the input is
 *          missing, malformed, or does not carry a usable tuple. Never throws.
 */
export function decodeCursor(cursor: string | undefined | null): FeedCursor | null {
  if (!cursor || typeof cursor !== 'string') {
    return null;
  }

  try {
    // Normalise standard base64 (`+`, `/`) to the URL-safe alphabet before
    // decoding, so both encodings round-trip through this single helper.
    const normalised = cursor.replace(/\+/g, '-').replace(/\//g, '_');
    const raw = Buffer.from(normalised, 'base64url').toString('utf8');

    const separator = raw.indexOf('|');
    if (separator === -1) {
      return null;
    }

    const createdAtPart = raw.slice(0, separator);
    const id = raw.slice(separator + 1);
    if (!createdAtPart || !id) {
      return null;
    }

    const createdAt = new Date(createdAtPart);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt, id };
  } catch {
    return null;
  }
}
