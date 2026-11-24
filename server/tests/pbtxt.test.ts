import { describe, expect, it } from 'vitest';
import { parseAnnotationPbtxt } from '../src/parsers/pbtxt.js';

describe('pbtxt annotation parser', () => {
  it('parses single-line space-separated Antigravity annotation format', () => {
    const sample =
      'last_user_view_time:{seconds:1795481200 nanos:500000000} title:"Migrate Billing API" ' +
      'archived:false marked_as_unread:true plan_execute:true ' +
      'side_question_cascade_ids:"sq-001" side_question_cascade_ids:"sq-002" ' +
      'side_question_titles:{key:"sq-001" value:"Check webhook retries"} ' +
      'side_question_titles:{key:"sq-002" value:"Confirm SDK version"}';

    const parsed = parseAnnotationPbtxt(sample);

    expect(parsed.title).toBe('Migrate Billing API');
    expect(parsed.lastUserViewAt).toBe(new Date(1795481200 * 1000 + 500).toISOString());
    expect(parsed.archived).toBe(false);
    expect(parsed.markedAsUnread).toBe(true);
    expect(parsed.planExecute).toBe(true);
    expect(parsed.sideQuestionIds).toEqual(['sq-001', 'sq-002']);
    expect(parsed.sideQuestionTitles).toEqual({
      'sq-001': 'Check webhook retries',
      'sq-002': 'Confirm SDK version',
    });
  });

  it('decodes UTF-8 octal byte escapes, escaped quotes, and archived timestamp', () => {
    // "中文标题" in UTF-8 bytes: E4 B8 AD E6 96 87 E6 A0 87 E9 A2 98
    // Octal: \344\270\255\346\226\207\346\240\207\351\242\230
    const sample =
      'title:"\\344\\270\\255\\346\\226\\207\\346\\240\\207\\351\\242\\230 \\"v2\\"" ' +
      'archived:true archival_status_timestamp:{seconds:1795400000 nanos:0}';

    const parsed = parseAnnotationPbtxt(sample);

    expect(parsed.title).toBe('中文标题 "v2"');
    expect(parsed.archived).toBe(true);
    expect(parsed.archivedAt).toBe(new Date(1795400000 * 1000).toISOString());
  });

  it('handles multi-line pbtxt with comments and missing optional fields', () => {
    const sample = `
      # Auto-generated annotation
      last_user_view_time: {
        seconds: 1795481200
        nanos: 123000000
      }
      marked_as_unread: false
    `;

    const parsed = parseAnnotationPbtxt(sample);
    expect(parsed.title).toBeNull();
    expect(parsed.archived).toBe(false);
    expect(parsed.markedAsUnread).toBe(false);
    expect(parsed.lastUserViewAt).toBe(new Date(1795481200 * 1000 + 123).toISOString());
    expect(parsed.sideQuestionIds).toEqual([]);
  });
});
