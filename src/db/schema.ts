import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatarUri: text('avatar_uri'),
});

export const couples = sqliteTable('couples', {
  id: text('id').primaryKey(),
  title: text('title'),
  anniversaryOn: text('anniversary_on'),
  currencyCode: text('currency_code').notNull().default('PHP'),
  timezone: text('timezone').notNull().default('Asia/Manila'),
  createdAt: integer('created_at').notNull(),
});

export const coupleMembers = sqliteTable(
  'couple_members',
  {
    coupleId: text('couple_id').notNull(),
    userId: text('user_id').notNull(),
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.coupleId, t.userId] }) }),
);

export const dates = sqliteTable(
  'dates',
  {
    id: text('id').primaryKey(),
    coupleId: text('couple_id').notNull(),
    title: text('title'),
    occurredOn: text('occurred_on').notNull(),
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),
    locationLabel: text('location_label'),
    coverPhotoId: text('cover_photo_id'),
    rating: integer('rating'),
    caption: text('caption'),
    status: text('status').notNull().default('draft'),
    createdBy: text('created_by').notNull(),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byCoupleDate: index('dates_couple_occurred_idx').on(t.coupleId, t.occurredOn),
    byStatus: index('dates_status_idx').on(t.coupleId, t.status),
  }),
);

export const stops = sqliteTable(
  'stops',
  {
    id: text('id').primaryKey(),
    dateId: text('date_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
    kind: text('kind').notNull(),
    subkind: text('subkind'),
    label: text('label'),
    placeName: text('place_name'),
    lat: real('lat'),
    lng: real('lng'),
    occurredAt: integer('occurred_at'),
    amountMinor: integer('amount_minor').notNull().default(0),
    currencyCode: text('currency_code').notNull(),
    paidByUserId: text('paid_by_user_id'),
    note: text('note'),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byDate: index('stops_date_idx').on(t.dateId, t.sortOrder),
    byKind: index('stops_kind_idx').on(t.kind),
  }),
);

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    dateId: text('date_id').notNull(),
    stopId: text('stop_id'),
    localUri: text('local_uri'),
    remoteKey: text('remote_key'),
    thumbKey: text('thumb_key'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    takenAt: integer('taken_at'),
    uploadState: text('upload_state').notNull().default('local'),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({ byDate: index('photos_date_idx').on(t.dateId) }),
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    coupleId: text('couple_id').notNull(),
    periodMonth: text('period_month').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byCouplePeriod: uniqueIndex('budgets_couple_period_idx').on(t.coupleId, t.periodMonth),
  }),
);

/**
 * Created in v1 migrations so v2 requires no schema change, but never written
 * to in v1 — there is no server to drain it to, and pairing performs a full
 * initial push rather than replaying local history.
 */
export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  op: text('op').notNull(),
  queuedAt: integer('queued_at').notNull(),
});
