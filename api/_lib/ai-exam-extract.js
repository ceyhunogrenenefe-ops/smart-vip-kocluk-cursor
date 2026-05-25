/**
 * PDF chunk metinlerinden çoktan seçmeli soruları yapılandırılmış JSON
 * olarak çıkartır. GPT-4o-mini ile json_schema (structured output) kullanır.
 */
import { resolveOpenAIKey } from './ai-rag.js';

const EXTRACT_MODEL = 'gpt-4o-mini';

const SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question_text: { type: 'string', description: 'Soru metni (gerekiyorsa kısa açıklama ile birlikte)' },
          options: {
            type: 'array',
            description: 'Şıklar (genellikle 4 ya da 5 adet, A) ... gibi)',
            items: { type: 'string' }
          },
          answer_key: {
            type: 'string',
            description: 'Doğru şık harfi (A, B, C, D, E) veya açık uçluysa boş'
          },
          solution: { type: 'string', description: 'Kısa çözüm/açıklama; PDF\'te varsa onu kullan' },
          topic: { type: 'string', description: 'Konu (ör: Hareket, Kuvvet, Optik)' },
          subtopic: { type: 'string', description: 'Alt konu (varsa, yoksa boş)' },
          difficulty: {
            type: 'string',
            enum: ['kolay', 'orta', 'zor'],
            description: 'Tahmini zorluk seviyesi'
          },
          confidence: {
            type: 'number',
            description: '0.0–1.0 arası — bu sorunun gerçekten kaliteli/parse edilebilir olduğuna dair güven'
          }
        },
        required: ['question_text', 'options', 'answer_key', 'solution', 'topic', 'difficulty', 'confidence'],
        additionalProperties: false
      }
    }
  },
  required: ['questions'],
  additionalProperties: false
};

const SYSTEM_PROMPT = [
  'Sen bir egitim materyalleri editorisin.',
  'Sana verilen metin parcasindan COKTAN SECMELI SORULARI cikar.',
  '',
  'KURALLAR:',
  '1. Sadece NET ve TAM olan soruları al. Yarım veya bozuk soruları atla.',
  '2. Her soru için: tam metin, tüm şıklar, doğru cevap harfi, kısa çözüm, konu, zorluk.',
  '3. Şık formatı: "A) ...", "B) ..." veya sadece içerik.',
  '4. Konu adını dersin kendi terimiyle yaz (ör: "Hareket", "Newton Kanunları", "Elektrik").',
  '5. Eğer metin parçasında soru yoksa boş liste döndür.',
  '6. PDF\'te doğru cevap belirtilmediyse answer_key boş bırakılabilir.',
  '7. confidence: 0.9+ = çok net, 0.7-0.9 = kabul edilebilir, <0.7 = atla.',
  'Cevabini SADECE belirtilen JSON sema ile ver.'
].join('\n');

export async function extractQuestionsFromChunks(chunks) {
  const apiKey = resolveOpenAIKey();
  if (!apiKey) throw new Error('openai_api_key_missing');

  const text = chunks
    .map((c) => `--- Sayfa ${c.page_no ?? '?'} ---\n${c.content}`)
    .join('\n\n');

  if (text.length > 60000) {
    throw new Error('chunk_batch_too_large');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: EXTRACT_MODEL,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Metin parçası:\n\n${text}` }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'exam_questions',
          strict: true,
          schema: SCHEMA
        }
      }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`extract_failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const j = await res.json();
  let payload;
  try {
    payload = JSON.parse(j.choices?.[0]?.message?.content || '{}');
  } catch {
    payload = { questions: [] };
  }

  return {
    questions: Array.isArray(payload.questions) ? payload.questions : [],
    usage: j.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    model: j.model || EXTRACT_MODEL
  };
}

export { EXTRACT_MODEL };
