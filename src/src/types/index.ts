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
  start: string;      // "HH:MM"
  dur: number;         // minutes
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
