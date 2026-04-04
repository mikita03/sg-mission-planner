export type BlockStatus = 'pending' | 'confirmed' | 'negotiating' | 'cancelled';

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

export interface Block {
  id: string;
  day: 'd0' | 'd1' | 'd2' | 'd3';
  team: 'A' | 'B';
  start: string;
  dur: number;
  type: string;
  label: string;
  detail: string;
  location: string;
  contact: string;
  assignee: string;
  memo: string;
  status: BlockStatus;
  comments: Comment[];
  editedBy: string;
  editedAt: number;
}

export interface Category {
  cls: string;
  lbl: string;
  ico: string;
}

export interface DayInfo {
  key: 'd0' | 'd1' | 'd2' | 'd3';
  label: string;
  desc: string;
  date: string;
}

export type Tab = 'schedule' | 'visits' | 'budget' | 'review';

// Team roster - who is on which team each day
export interface TeamRoster {
  // key: "d0_A", "d0_B", "d1_A", etc.
  [dayTeam: string]: string[]; // array of member names
}
