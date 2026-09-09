/**
 * `@relay-ckb/ckb` surface — client-safe CKB builders + codecs.
 * Use from wallet / Arena flows, not from Node-only API routes that must stay
 * free of connector-react.
 *
 * Event Engine v3: Event + Participant + Treasury + Claim.
 */

export {
  buildCreateEventTx,
  buildJoinEventTx,
  mintCreateEvent,
  joinEventOnChain,
  eventModeToCode,
  eventCellsLive,
  parseEventCellData,
  EVENT_CELL_DATA_LEN,
  EVENT_CELL_VERSION,
  EVENT_FLAG_INLINE_POT,
  PARTICIPANT_DATA_LEN,
  CLAIM_DATA_LEN,
  MAX_PARTICIPANT_SLOTS,
  EventModeCode,
  EventStatusCode,
  EventTurnStateCode,
  ckbToShannons,
  shannonsToCkb,
  encodeEventCellData,
  decodeEventCellData,
  encodeEventTreasuryArgs,
  encodeParticipantArgs,
  encodeParticipantData,
  decodeParticipantData,
  encodeClaimData,
  decodeClaimData,
  encodeClaimArgs,
  absoluteTimestampSince,
  type EventCellData,
  type CreateEventCellInput,
  type JoinEventCellInput,
  type MintedEventCell,
  type JoinedEventCell,
} from '@/lib/registry/event-cell';
