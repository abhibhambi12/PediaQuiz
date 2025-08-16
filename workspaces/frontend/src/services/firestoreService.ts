import { collection, getDocs, query, where, Timestamp, QueryDocumentSnapshot, documentId } from "firebase/firestore";
import { db } from "@/firebase";
import type { Topic, Chapter, MCQ, Flashcard, ContentGenerationJob } from "@pediaquiz/types";

const normalizeId = (name: string): string => {
  if (typeof name !== 'string') return 'unknown';
  return name.replace(/\s+/g, '_').toLowerCase();
};

export async function getTopics(): Promise<Topic[]> {
  const generalTopicSnapshot = await getDocs(collection(db, "Topics"));
  const marrowTopicSnapshot = await getDocs(collection(db, "MarrowTopics"));
  const allTopics: Topic[] = [];
  
  generalTopicSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const topicId = normalizeId(doc.id);
      const topicName = data.name || doc.id;
      const chapters: Chapter[] = (data.chapters || []).map((chapterData: any): Chapter => ({
          id: normalizeId(chapterData.name || chapterData), name: chapterData.name || chapterData, 
          mcqCount: chapterData.mcqCount || 0, flashcardCount: chapterData.flashcardCount || 0, 
          topicId: topicId, source: 'General', topicName: topicName,
          sourceUploadIds: chapterData.sourceUploadIds || [], originalTextRefIds: chapterData.originalTextRefIds || [], summaryNotes: chapterData.summaryNotes || null
      }));
      allTopics.push({
          id: topicId, name: topicName, chapters, chapterCount: chapters.length,
          totalMcqCount: chapters.reduce((sum, ch) => sum + ch.mcqCount, 0),
          totalFlashcardCount: chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0),
          source: 'General'
      });
  });

  marrowTopicSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const topicId = doc.id;
      const topicName = data.name;
      const chapters: Chapter[] = (data.chapters || []).map((chData: any): Chapter => ({
          ...chData, id: chData.id, name: chData.name, mcqCount: chData.mcqCount || 0, flashcardCount: chData.flashcardCount || 0, 
          topicId: topicId, source: 'Marrow', topicName: topicName
      }));
      allTopics.push({
          id: topicId, name: topicName, chapters, chapterCount: chapters.length,
          totalMcqCount: chapters.reduce((sum, ch) => sum + ch.mcqCount, 0),
          totalFlashcardCount: chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0),
          source: 'Marrow'
      });
  });
  return allTopics.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getKeyClinicalTopics(): Promise<string[]> {
  const snapshot = await getDocs(collection(db, 'KeyClinicalTopics'));
  return snapshot.docs.map(doc => doc.data().name as string).sort();
}

export async function getChapterContent(chapterId: string): Promise<{ mcqs: MCQ[], flashcards: Flashcard[] }> {
    if (!chapterId) return { mcqs: [], flashcards: [] };
    
    const mcqsQuery1 = query(collection(db, 'MasterMCQ'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));
    const mcqsQuery2 = query(collection(db, 'MarrowMCQ'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));
    const flashcardsQuery = query(collection(db, 'Flashcards'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));

    const [mcqSnap1, mcqSnap2, flashcardSnap] = await Promise.all([
        getDocs(mcqsQuery1),
        getDocs(mcqsQuery2),
        getDocs(flashcardsQuery)
    ]);

    const mcqs: MCQ[] = [...mcqSnap1.docs, ...mcqSnap2.docs].map(doc => ({ id: doc.id, ...doc.data() } as MCQ));
    const flashcards: Flashcard[] = flashcardSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));

    return { mcqs, flashcards };
}

export async function getAllMcqs(): Promise<MCQ[]> {
  const [s1, s2] = await Promise.all([
    getDocs(query(collection(db, 'MasterMCQ'), where('status', '==', 'approved'))),
    getDocs(query(collection(db, 'MarrowMCQ'), where('status', '==', 'approved')))
  ]);
  const mcqs: MCQ[] = [];
  s1.forEach(doc => mcqs.push({ id: doc.id, ...doc.data() } as MCQ));
  s2.forEach(doc => mcqs.push({ id: doc.id, ...doc.data() } as MCQ));
  return mcqs;
}

async function getAllFlashcards(): Promise<Flashcard[]> {
  const snapshot = await getDocs(query(collection(db, 'Flashcards'), where('status', '==', 'approved')));
  const flashcards: Flashcard[] = [];
  snapshot.forEach(doc => flashcards.push({ id: doc.id, ...doc.data() } as Flashcard));
  return flashcards;
}

export async function getMcqsByIds(mcqIds: string[]): Promise<MCQ[]> {
    if (!mcqIds || mcqIds.length === 0) return [];
    const mcqs: MCQ[] = [];
    const chunkSize = 30;

    for (let i = 0; i < mcqIds.length; i += chunkSize) {
        const chunk = mcqIds.slice(i, i + chunkSize);
        const masterQuery = query(collection(db, 'MasterMCQ'), where(documentId(), 'in', chunk));
        const marrowQuery = query(collection(db, 'MarrowMCQ'), where(documentId(), 'in', chunk));
        const [masterSnapshot, marrowSnapshot] = await Promise.all([getDocs(masterQuery), getDocs(marrowQuery)]);
        masterSnapshot.forEach(doc => mcqs.push({ id: doc.id, ...doc.data() } as MCQ));
        marrowSnapshot.forEach(doc => mcqs.push({ id: doc.id, ...doc.data() } as MCQ));
    }
    const mcqMap = new Map(mcqs.map(mcq => [mcq.id, mcq]));
    return mcqIds.map(id => mcqMap.get(id)).filter((mcq): mcq is MCQ => !!mcq);
}

export async function getFlashcardsByIds(flashcardIds: string[]): Promise<Flashcard[]> {
    if (!flashcardIds || flashcardIds.length === 0) return [];
    const flashcards: Flashcard[] = [];
    const chunkSize = 30; 

    for (let i = 0; i < flashcardIds.length; i += chunkSize) {
        const chunk = flashcardIds.slice(i, i + chunkSize);
        const flashcardQuery = query(collection(db, 'Flashcards'), where(documentId(), 'in', chunk));
        const flashcardSnapshot = await getDocs(flashcardQuery);
        flashcardSnapshot.forEach(doc => {
            flashcards.push({ id: doc.id, ...doc.data() } as Flashcard);
        });
    }
    const flashcardMap = new Map(flashcards.map(fc => [fc.id, fc]));
    return flashcardIds.map(id => flashcardMap.get(id)).filter((fc): fc is Flashcard => !!fc);
}

export async function getUserUploadDocuments(uploadIds: string[]): Promise<ContentGenerationJob[]> {
    if (!uploadIds || uploadIds.length === 0) return [];
    const docRef = collection(db, 'contentGenerationJobs');
    const q = query(docRef, where(documentId(), 'in', uploadIds));
    const querySnapshot = await getDocs(q);
    const uploads: ContentGenerationJob[] = [];
    querySnapshot.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        uploads.push({
            ...data, id: doc.id,
            createdAt: (data.createdAt as Timestamp)?.toDate(),
            updatedAt: (data.updatedAt as Timestamp)?.toDate(),
        } as ContentGenerationJob);
    });
    return uploads;
}

export async function searchContent(queryText: string, terms: string[]): Promise<{ mcqs: MCQ[], flashcards: Flashcard[] }> {
    if (!queryText && terms.length === 0) return { mcqs: [], flashcards: [] };

    const searchTerms = Array.from(new Set([queryText, ...terms].filter(Boolean))).map(term => term.toLowerCase());
    
    const [allMcqs, allFlashcards] = await Promise.all([getAllMcqs(), getAllFlashcards()]);

    const mcqResults = allMcqs.filter(mcq => {
        const searchableContent = [mcq.question, ...mcq.options, mcq.explanation, ...(mcq.tags || []), mcq.topicName, mcq.chapterName].filter(Boolean).join(' ').toLowerCase();
        return searchTerms.some(term => searchableContent.includes(term));
    });

    const flashcardResults = allFlashcards.filter(flashcard => {
        const searchableContent = [flashcard.front, flashcard.back, ...(flashcard.tags || []), flashcard.topicName, flashcard.chapterName].filter(Boolean).join(' ').toLowerCase();
        return searchTerms.some(term => searchableContent.includes(term));
    });

    return { mcqs: mcqResults, flashcards: flashcardResults };
}