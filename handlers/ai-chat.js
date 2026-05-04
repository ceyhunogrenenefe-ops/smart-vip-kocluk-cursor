import { handleAiExamAnalyze } from '../api/_lib/ai-exam-analyze.js';

async function handleAiChat(req, res) {
  try {
    const { prompt, studentContext } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
    if (!apiKey) {
      const fallbackContent = [
        'AI servisi su anda sinirli modda calisiyor (API anahtari tanimli degil).',
        '',
        'Hizli Oneri:',
        '- Son 7 gun verisini kontrol edin.',
        '- Yanlis orani yuksek olan derse bugun ek tekrar ekleyin.',
        '- Veliye kisa durum ozeti ve yarin hedefini gonderin.'
      ].join('\n');
      return res.status(200).json({ content: fallbackContent });
    }

    const systemPrompt =
      'Sen bir egitim kocu asistanisin. Turkce cevap ver. Cevaplarin net, uygulanabilir ve ogrenci odakli olsun.';
    const userPrompt = [
      'Ogrenci baglami:',
      studentContext || 'Baglam yok',
      '',
      'Kullanicinin sorusu:',
      prompt
    ].join('\n');

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const payload = await aiResponse.json();
    if (!aiResponse.ok) {
      const fallbackContent = [
        'AI servisine gecici olarak ulasilamadi. Lutfen biraz sonra tekrar deneyin.',
        '',
        'Hizli Oneri:',
        '- Ogrencinin son deneme trendini inceleyin.',
        '- Bu hafta icin net bir soru hedefi yazin.',
        '- Veliye bugun/yarin icin kisa takip plani paylasin.'
      ].join('\n');
      return res.status(200).json({ content: fallbackContent });
    }

    const content = payload?.choices?.[0]?.message?.content;
    return res.status(200).json({ content: content || 'Yanit uretilemedi.' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown server error'
    });
  }
}

/** Hobby: tek işlev — sohbet + sınav analizi (GET liste / POST op:analyze_exam). */
export default async function handler(req, res) {
  const sidRaw = req.query?.student_id;
  const sid = Array.isArray(sidRaw) ? sidRaw[0] : sidRaw;

  if (req.method === 'GET' && String(sid || '').trim()) {
    return handleAiExamAnalyze(req, res);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (body.op === 'analyze_exam' || body.analyze_exam === true) {
      return handleAiExamAnalyze(req, res);
    }
    return handleAiChat(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

