export type BlockStatus = 'pending' | 'confirmed' | 'negotiating' | 'cancelled';

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

// Parent categories
export type ParentCategory = 'visit' | 'atxsg' | 'move' | 'food' | 'sync' | 'review' | 'reserve';

// Sub-types for move and food
export type MoveSubType = 'taxi' | 'mrt' | 'flight' | 'walk';
export type FoodSubType = 'lunch' | 'dinner';

export interface Block {
  id: string;
  day: 'd0' | 'd1' | 'd2' | 'd3';
  team: 'A' | 'B';
  start: string;
  dur: number;
  category: ParentCategory;
  subType: string;        // e.g. 'taxi', 'lunch', '' for no sub-type
  label: string;
  detail: string;         // company name for visit, session for atxsg, etc.
  location: string;
  fromLocation: string;   // for move blocks
  contact: string;
  assignee: string;
  memo: string;
  draft: boolean;         // true = not yet confirmed
  status: BlockStatus;
  comments: Comment[];
  editedBy: string;
  editedAt: number;
  mapUrl: string;          // Google Maps URL
  // Legacy compat
  type?: string;
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

export interface TeamRoster {
  [dayTeam: string]: string[];
}
