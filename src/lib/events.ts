export type EventType = "flag_captured";

export type EventLog = {
  _id: string;
  id: string;
  event: EventType;
  user: string;
  flag: string;
  timestamp: string;
};

export type EventPayload = {
  id: string;
  event: EventType;
  user: string;
  flag: string;
  timestamp: string;
};

export type StreamMessage =
  | {
      type: "event";
      payload: EventLog;
    }
  | {
      type: "clear";
    };
