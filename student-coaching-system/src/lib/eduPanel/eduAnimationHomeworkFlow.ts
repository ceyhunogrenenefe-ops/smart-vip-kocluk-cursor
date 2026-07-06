import type { EduAnimationPoolItem, EduClass, EduLessonRow } from '../../types/eduPanel.types';
import {
  attachPoolAnimationToLessonRow,
  createEduHomework,
  createEduLessonRow,
  publishEduHomework
} from './eduPanelApi';
import { classLevelMatchesPool, topicPoolClassKeyForPoolItem, type PoolFilterContext } from './eduAnimationTopicBridge';

function defaultUntil(from: string): string {
  const d = new Date(`${from.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function rowClassIds(row: EduLessonRow): string[] {
  return row.class_ids?.length ? row.class_ids : [row.class_id];
}

export function classesMatchingPoolItem(
  classes: EduClass[],
  item: EduAnimationPoolItem,
  prefer?: PoolFilterContext
): EduClass[] {
  const topicClass = topicPoolClassKeyForPoolItem(item, prefer);
  return classes.filter((c) => classLevelMatchesPool(c.class_level, topicClass));
}

export function findExistingLessonRow(
  rows: EduLessonRow[],
  teacherUserId: string,
  classId: string,
  subjectName: string,
  topicTitle: string
): EduLessonRow | undefined {
  const title = topicTitle.trim();
  return rows.find(
    (row) =>
      String(row.teacher_user_id) === String(teacherUserId) &&
      row.subject_name === subjectName &&
      row.title.trim() === title &&
      rowClassIds(row).includes(classId)
  );
}

export async function assignPoolAnimationHomework(params: {
  poolItem: EduAnimationPoolItem;
  topicTitle: string;
  subjectKey: string;
  classId: string;
  classIds?: string[];
  existingRows: EduLessonRow[];
  teacherUserId: string;
}): Promise<{ lessonRowId: string; homeworkId: string; createdRow: boolean }> {
  const { poolItem, topicTitle, subjectKey, classId, teacherUserId, existingRows } = params;
  const classIds = params.classIds?.length ? params.classIds : [classId];
  const primaryClassId = classIds[0] || classId;
  const today = new Date().toISOString().slice(0, 10);

  let row =
    findExistingLessonRow(existingRows, teacherUserId, primaryClassId, subjectKey, topicTitle) ||
    findExistingLessonRow(existingRows, teacherUserId, primaryClassId, poolItem.subject_name, topicTitle);

  let createdRow = false;
  if (!row) {
    const { data } = await createEduLessonRow({
      class_id: primaryClassId,
      class_ids: classIds,
      title: topicTitle.trim(),
      subject_name: subjectKey,
      subject_color: 'blue',
      lesson_date: today,
      available_from: today,
      available_until: defaultUntil(today),
      status: 'active',
      notes: ''
    });
    row = data;
    createdRow = true;
  }

  await attachPoolAnimationToLessonRow(row.id, poolItem.id);

  const hw = await createEduHomework(row.id, {
    title: poolItem.title.trim(),
    status: 'draft',
    pool_animation_id: poolItem.id
  });
  await publishEduHomework(hw.id);

  return { lessonRowId: row.id, homeworkId: hw.id, createdRow };
}
