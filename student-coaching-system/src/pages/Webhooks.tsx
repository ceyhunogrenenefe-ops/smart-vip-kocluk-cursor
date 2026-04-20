// Türkçe: Webhook Ayarları Sayfası - Edisis ve sınav sistemleri entegrasyonu
import React, { useState } from 'react';
import {
  Webhook,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  Key,
  Link
} from 'lucide-react';

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  status: 'active' | 'inactive';
  lastTriggered?: Date;
  createdAt: Date;
}

export default function Webhooks() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([
    {
      id: '1',
      name: 'Edisis Sınav Sistemi',
      url: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/exam-results`,
      secret: 'edisis_secret_' + Math.random().toString(36).substring(7),
      events: ['exam.completed', 'exam.results'],
      status: 'active',
      lastTriggered: new Date(Date.now() - 3600000),
      createdAt: new Date()
    }
  ]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<Array<{
    id: string;
    endpoint: string;
    event: string;
    status: 'success' | 'error';
    timestamp: Date;
    message: string;
  }>>([
    {
      id: '1',
      endpoint: 'Edisis Sınav Sistemi',
      event: 'exam.completed',
      status: 'success',
      timestamp: new Date(Date.now() - 3600000),
      message: 'Veriler başarıyla işlendi. 24 öğrenci güncellendi.'
    },
    {
      id: '2',
      endpoint: 'Edisis Sınav Sistemi',
      event: 'exam.results',
      status: 'success',
      timestamp: new Date(Date.now() - 86400000),
      message: 'TYT deneme sonuçları alındı ve kaydedildi.'
    }
  ]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleEndpoint = (id: string) => {
    setEndpoints(prev => prev.map(ep =>
      ep.id === id ? { ...ep, status: ep.status === 'active' ? 'inactive' : 'active' } : ep
    ));
  };

  const deleteEndpoint = (id: string) => {
    if (confirm('Bu webhook endpoint\'ini silmek istediğinize emin misiniz?')) {
      setEndpoints(prev => prev.filter(ep => ep.id !== id));
    }
  };

  const generateSecret = () => {
    return 'whsec_' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <Webhook className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Webhook Ayarları</h2>
            <p className="text-green-100">Sınav sistemleri ve dış uygulamalarla entegrasyon</p>
          </div>
        </div>
      </div>

      {/* API Bilgisi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Link className="w-5 h-5 text-green-600" />
          Ana Webhook URL
        </h3>
        <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Exam Results Webhook URL</p>
              <code className="text-lg font-mono text-green-700 break-all">
                {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/exam-results
              </code>
            </div>
            <button
              onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/exam-results`, 'main')}
              className="p-2 bg-white rounded-lg hover:bg-green-100 transition-colors"
            >
              {copiedId === 'main' ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Copy className="w-5 h-5 text-green-600" />
              )}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">HTTP Method</p>
            <p className="font-semibold text-slate-800">POST</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Content Type</p>
            <p className="font-semibold text-slate-800">application/json</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Kimlik Doğrulama</p>
            <p className="font-semibold text-slate-800">Bearer Token</p>
          </div>
        </div>
      </div>

      {/* Endpoint Listesi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Webhook Endpoints
          </h3>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Yeni Endpoint Ekle
          </button>
        </div>

        <div className="space-y-4">
          {endpoints.map(endpoint => (
            <div key={endpoint.id} className="border border-gray-200 rounded-xl p-4 hover:border-green-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-slate-800">{endpoint.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      endpoint.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {endpoint.status === 'active' ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Link className="w-4 h-4 text-gray-400" />
                      <code className="text-gray-600 bg-gray-50 px-2 py-0.5 rounded">{endpoint.url}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-gray-400" />
                      <code className="text-gray-600 bg-gray-50 px-2 py-0.5 rounded">{endpoint.secret.substring(0, 20)}...</code>
                      <button
                        onClick={() => copyToClipboard(endpoint.secret, endpoint.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {copiedId === endpoint.id ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Olaylar:</span>
                      {endpoint.events.map(event => (
                        <span key={event} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                          {event}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEndpoint(endpoint.id)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      endpoint.status === 'active'
                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                  >
                    {endpoint.status === 'active' ? 'Pasifleştir' : 'Aktifleştir'}
                  </button>
                  <button
                    onClick={() => deleteEndpoint(endpoint.id)}
                    className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {endpoint.lastTriggered && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  Son tetiklenme: {endpoint.lastTriggered.toLocaleString('tr-TR')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Webhook Logs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <RefreshCw className="w-5 h-5" />
          Son Webhook İşlemleri
        </h3>

        <div className="space-y-3">
          {webhookLogs.map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                log.status === 'success' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {log.status === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{log.endpoint}</span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{log.event}</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {log.timestamp.toLocaleString('tr-TR')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{log.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Entegrasyon Kılavuzu */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
        <h3 className="font-semibold text-blue-800 mb-4 flex items-center gap-2">
          <ExternalLink className="w-5 h-5" />
          Entegrasyon Kılavuzu
        </h3>

        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-medium text-slate-800 mb-2">1. Edisis Entegrasyonu</h4>
            <ol className="list-decimal list-inside text-gray-600 space-y-1">
              <li>Edisis panelinde Webhook ayarlarını açın</li>
              <li>Yukarıdaki URL'yi "Callback URL" olarak yapıştırın</li>
              <li>Secret anahtarını Ediasis'te kaydedin</li>
              <li>"exam.completed" olayını seçin</li>
            </ol>
          </div>

          <div>
            <h4 className="font-medium text-slate-800 mb-2">2. Webhook Payload Formatı</h4>
            <pre className="bg-slate-800 text-slate-100 p-4 rounded-lg overflow-x-auto text-xs">
{`{
  "event": "exam.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "student_id": "STU001",
    "exam_type": "TYT",
    "results": [
      { "subject": "Matematik", "net": 12.5 },
      { "subject": "Türkçe", "net": 8.0 },
      { "subject": "Fen", "net": 9.25 }
    ],
    "total_net": 29.75,
    "raw_score": 450
  }
}`}
            </pre>
          </div>

          <div>
            <h4 className="font-medium text-slate-800 mb-2">3. Kimlik Doğrulama</h4>
            <p className="text-gray-600">
              Tüm webhook istekleri Bearer token ile doğrulanır. Her istekte headers'a ekleyin:
            </p>
            <code className="block bg-slate-800 text-slate-100 p-2 rounded mt-2 text-xs">
              Authorization: Bearer [SECRET_KEY]
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
