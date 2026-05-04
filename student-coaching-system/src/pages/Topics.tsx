// Türkçe: Konu Havuzu Sayfası
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { topicPool } from '../data/mockData';
import { yosTopicPool } from '../data/yosTopicPool';
import { parseClassLevelFromForm, TOPIC_CLASS_OPTIONS } from '../types';
import {
  BookOpen,
  Plus,
  X,
  ChevronDown,
  Search,
  Trash2,
  Edit2,
  Check
} from 'lucide-react';

export default function Topics() {
  const { addTopic } = useApp();
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedClassKey, setSelectedClassKey] = useState('12');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTopic, setNewTopic] = useState('');

  const mergedTopicPool = useMemo(() => {
    const next = { ...topicPool } as Record<string, Record<string, string[]>>;
    Object.entries(yosTopicPool).forEach(([subject, levels]) => {
      next[subject] = {
        ...(next[subject] || {}),
        ...(levels as Record<string, string[]>)
      };
    });
    return next;
  }, []);

  const subjects = Object.keys(mergedTopicPool);

  const resolvedClass = useMemo(
    () => parseClassLevelFromForm(selectedClassKey),
    [selectedClassKey]
  );

  const currentTopics = selectedSubject && mergedTopicPool[selectedSubject]
    ? mergedTopicPool[selectedSubject][resolvedClass] || []
    : [];

  const classLabel =
    TOPIC_CLASS_OPTIONS.find(o => o.value === selectedClassKey)?.label || selectedClassKey;

  const handleAddTopic = () => {
    if (newTopic.trim() && selectedSubject) {
      addTopic(selectedSubject, resolvedClass, newTopic.trim());
      setNewTopic('');
      setShowAddModal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Konu Havuzu</h2>
          <p className="text-gray-500">İlkokul, ortaokul, lise ve YKS konu havuzları</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Yeni Konu Ekle
        </button>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Ders Seçimi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ders</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Ders Seçin</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>

          {/* Sınıf Seçimi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sınıf</label>
            <select
              value={selectedClassKey}
              onChange={(e) => setSelectedClassKey(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {TOPIC_CLASS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Konu Sayısı */}
          <div className="flex items-end">
            <div className="bg-slate-50 rounded-lg px-4 py-3 flex-1">
              <p className="text-sm text-gray-500">Toplam Konu</p>
              <p className="text-2xl font-bold text-slate-800">
                {selectedSubject ? currentTopics.length : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Konu Listesi */}
      {selectedSubject ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-slate-50">
            <h3 className="font-semibold text-slate-800">
              {selectedSubject} — {classLabel}
            </h3>
          </div>
          <div className="p-4">
            {currentTopics.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentTopics.map((topic, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 rounded-lg p-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-medium text-sm">
                        {index + 1}
                      </span>
                      <span className="text-gray-700">{topic}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Bu ders ve sınıf için konu bulunamadı.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {subjects.map((subject) => (
            <div
              key={subject}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedSubject(subject)}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-slate-800">{subject}</h3>
              </div>
              <p className="text-sm text-gray-500">
                {Object.values(mergedTopicPool[subject]).flat().length} konu
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tüm Konular Grid */}
      {selectedSubject && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOPIC_CLASS_OPTIONS.map((opt) => {
            const cls = parseClassLevelFromForm(opt.value);
            const list = mergedTopicPool[selectedSubject]?.[cls] || [];
            return (
              <div
                key={opt.value}
                onClick={() => setSelectedClassKey(opt.value)}
                className={`bg-white rounded-xl shadow-sm border p-4 cursor-pointer transition-all ${
                  selectedClassKey === opt.value
                    ? 'border-red-500 ring-2 ring-red-100'
                    : 'border-gray-100 hover:shadow-md'
                }`}
              >
                <h4 className="font-semibold text-slate-800 mb-2">{opt.label}</h4>
                <p className="text-sm text-gray-500">{list.length} konu</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {list.slice(0, 3).map((topic, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                    >
                      {topic}
                    </span>
                  ))}
                  {list.length > 3 && (
                    <span className="px-2 py-0.5 text-gray-500 text-xs">
                      +{list.length - 3} daha
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Topic Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-slate-800">Yeni Konu Ekle</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewTopic('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Ders Seçimi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ders *</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Ders Seçin</option>
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sınıf Seçimi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf *</label>
                <select
                  value={selectedClassKey}
                  onChange={(e) => setSelectedClassKey(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {TOPIC_CLASS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Konu Adı */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Konu Adı *</label>
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Örn: Türev, İntegral, vb."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewTopic('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleAddTopic}
                disabled={!selectedSubject || !newTopic.trim()}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
