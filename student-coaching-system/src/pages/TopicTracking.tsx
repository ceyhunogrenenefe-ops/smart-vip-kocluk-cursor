// Türkçe: Konu Takibi Sayfası - Öğrencinin hangi konuları bitirdiğini gösterir
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatClassLevelLabel } from '../types';
import {
  BookOpen,
  CheckCircle,
  Search,
  GraduationCap,
  RotateCcw,
  Calendar,
  Filter,
  Layers
} from 'lucide-react';

// YKS sınıf türlerini tanımla
const YKS_TYPES = {
  'YKS-Sayısal': { label: 'Sayısal', color: 'blue' },
  'YKS-Eşit Ağırlık': { label: 'Eşit Ağırlık', color: 'purple' },
  'YKS-Sözel': { label: 'Sözel', color: 'green' }
};

export default function TopicTracking() {
  const {
    students,
    topicProgress,
    getTopicsByClass,
    getCompletedTopicsBySubject,
    markTopicCompleted,
    resetTopicProgress,
    getStudentTopicProgress
  } = useApp();

  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<'all' | 'tyt' | 'ayt'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Öğrencinin sınıfına göre konuları al
  const studentClassLevel = selectedStudent?.classLevel || 12;
  const topicsData = getTopicsByClass(studentClassLevel);

  // YKS öğrencisi mi kontrol et
  const isYKSStudent = topicsData.isYKS;
  const isRegularStudent = !topicsData.isYKS;

  // Seçili öğrencinin tamamlanmış konuları
  const completedTopics = selectedStudentId
    ? getStudentTopicProgress(selectedStudentId)
    : [];

  // Konu bazında tamamlama durumu
  const getTopicCompletion = (subject: string, topic: string) => {
    return completedTopics.some(
      p => p.subject === subject && p.topic === topic
    );
  };

  // YKS için TYT ve AYT konularını filtrele
  const getFilteredYKSTopics = () => {
    const filtered: { tytSubjects: Record<string, string[]>; aytSubjects: Record<string, string[]> } = {
      tytSubjects: {},
      aytSubjects: {}
    };

    if (searchTerm) {
      // TYT Derslerini filtrele
      Object.keys(topicsData.tytSubjects).forEach(subject => {
        const filteredTopics = topicsData.tytSubjects[subject].filter(t =>
          t.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (filteredTopics.length > 0) {
          filtered.tytSubjects[subject] = filteredTopics;
        }
      });
      // AYT Derslerini filtrele
      Object.keys(topicsData.aytSubjects).forEach(subject => {
        const filteredTopics = topicsData.aytSubjects[subject].filter(t =>
          t.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (filteredTopics.length > 0) {
          filtered.aytSubjects[subject] = filteredTopics;
        }
      });
    } else {
      filtered.tytSubjects = { ...topicsData.tytSubjects };
      filtered.aytSubjects = { ...topicsData.aytSubjects };
    }

    return filtered;
  };

  const filteredYKSTopics = isYKSStudent ? getFilteredYKSTopics() : null;

  // Normal sınıflar için filtreleme
  const getFilteredRegularTopics = () => {
    const filtered: Record<string, string[]> = {};

    if (searchTerm) {
      Object.keys(topicsData.regular).forEach(subject => {
        const filteredSubjects = topicsData.regular[subject].filter(t =>
          t.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (filteredSubjects.length > 0) {
          filtered[subject] = filteredSubjects;
        }
      });
    } else {
      Object.keys(topicsData.regular).forEach(subject => {
        if (topicsData.regular[subject].length > 0) {
          filtered[subject] = topicsData.regular[subject];
        }
      });
    }

    return filtered;
  };

  const filteredRegularTopics = isRegularStudent ? getFilteredRegularTopics() : null;

  // Ders listesini al
  const getSubjectList = () => {
    if (isYKSStudent) {
      const subjects: string[] = [];
      if (selectedSection === 'all' || selectedSection === 'tyt') {
        // TYT konularını her ders için ayrı ekle
        Object.keys(filteredYKSTopics?.tytSubjects || {}).forEach(subject => {
          subjects.push(subject);
        });
      }
      if (selectedSection === 'all' || selectedSection === 'ayt') {
        Object.keys(filteredYKSTopics?.aytSubjects || {}).forEach(subject => {
          subjects.push(subject);
        });
      }
      return subjects;
    }
    return Object.keys(filteredRegularTopics || {});
  };

  const subjects = getSubjectList();

  // Ders bazında istatistikler
  const getSubjectStats = (subject: string) => {
    let topics: string[] = [];
    let completed = completedTopics.filter(p => p.subject === subject).length;

    if (isYKSStudent) {
      // TYT veya AYT konularını al
      if (subject.startsWith('TYT ')) {
        topics = filteredYKSTopics?.tytSubjects[subject] || [];
      } else if (subject.startsWith('AYT ')) {
        topics = filteredYKSTopics?.aytSubjects[subject] || [];
      }
    } else {
      topics = filteredRegularTopics?.[subject] || [];
    }

    const percentage = topics.length > 0
      ? Math.round((completed / topics.length) * 100)
      : 0;
    return { total: topics.length, completed, percentage };
  };

  // Toplam istatistikler
  const getTotalStats = () => {
    let totalTopics = 0;
    let completedCount = 0;

    if (isYKSStudent) {
      if (selectedSection === 'all' || selectedSection === 'tyt') {
        Object.values(filteredYKSTopics?.tytSubjects || {}).forEach(topics => {
          totalTopics += topics.length;
        });
      }
      if (selectedSection === 'all' || selectedSection === 'ayt') {
        Object.values(filteredYKSTopics?.aytSubjects || {}).forEach(topics => {
          totalTopics += topics.length;
        });
      }
    } else {
      Object.values(filteredRegularTopics || {}).forEach(topics => {
        totalTopics += topics.length;
      });
    }

    completedCount = completedTopics.length;
    return {
      total: totalTopics,
      completed: completedCount,
      percentage: totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0
    };
  };

  // Konu listesini al
  const getTopicsForSubject = (subject: string): string[] => {
    if (isYKSStudent) {
      if (subject.startsWith('TYT ')) {
        return filteredYKSTopics?.tytSubjects[subject] || [];
      } else if (subject.startsWith('AYT ')) {
        return filteredYKSTopics?.aytSubjects[subject] || [];
      }
      return [];
    }
    return filteredRegularTopics?.[subject] || [];
  };

  // Öğrencinin sınıf etiketini al
  const getClassLabel = () => {
    if (isYKSStudent) {
      const yksType = YKS_TYPES[studentClassLevel as keyof typeof YKS_TYPES];
      return yksType ? yksType.label : studentClassLevel;
    }
    return formatClassLevelLabel(studentClassLevel);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Konu Takibi</h2>
          <p className="text-gray-500">Öğrencilerin konu tamamlama durumlarını takip edin</p>
        </div>
        {isYKSStudent && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <Layers className="w-5 h-5" />
            <span className="font-medium">{getClassLabel()} Öğrencisi</span>
          </div>
        )}
      </div>

      {/* Öğrenci Seçimi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <GraduationCap className="w-4 h-4 inline mr-1" />
              Öğrenci Seçin
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                setSelectedStudentId(e.target.value);
                setSelectedSubject('all');
                setSelectedSection('all');
              }}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Öğrenci Seçin</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} - {formatClassLevelLabel(student.classLevel)}
                </option>
              ))}
            </select>
          </div>

          {selectedStudentId && (
            <>
              {/* YKS Bölüm Seçimi */}
              {isYKSStudent && (
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Filter className="w-4 h-4 inline mr-1" />
                    Bölüm Seçimi
                  </label>
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value as 'all' | 'tyt' | 'ayt')}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="all">Tüm Konular</option>
                    <option value="tyt">TYT (Temel Yeterlilik)</option>
                    <option value="ayt">AYT (Alan Yeterlilik)</option>
                  </select>
                </div>
              )}

              {/* Ders Filtresi */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Filter className="w-4 h-4 inline mr-1" />
                  Ders Filtresi
                </label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">Tüm Dersler</option>
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject} ({getSubjectStats(subject).completed}/{getSubjectStats(subject).total})
                    </option>
                  ))}
                </select>
              </div>

              {/* Konu Arama */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Search className="w-4 h-4 inline mr-1" />
                  Konu Ara
                </label>
                <input
                  type="text"
                  placeholder="Konu adı yazın..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Öğrenci Seçildiğinde Göster */}
      {selectedStudent && (
        <>
          {/* Genel İstatistikler */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                {selectedStudent.name} - Konu Takibi
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({getClassLabel()})
                </span>
              </h3>
              <button
                onClick={() => {
                  if (confirm('Tüm konu ilerlemesini sıfırlamak istediğinizden emin misiniz?')) {
                    resetTopicProgress(selectedStudentId);
                  }
                }}
                className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Sıfırla
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Genel İlerleme</span>
                <span className="font-medium text-slate-800">
                  {getTotalStats().completed} / {getTotalStats().total} konu (%{getTotalStats().percentage})
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${getTotalStats().percentage}%` }}
                />
              </div>
            </div>

            {/* YKS Bölüm İstatistikleri */}
            {isYKSStudent && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                {(selectedSection === 'all' || selectedSection === 'tyt') && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          TYT
                        </div>
                        <span className="font-semibold text-blue-800">TYT</span>
                      </div>
                      <span className="text-sm text-blue-600">
                        {Object.keys(filteredYKSTopics?.tytSubjects || {}).length} Ders
                      </span>
                    </div>
                    <div className="mt-2 w-full bg-blue-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{
                          width: `100%`
                        }}
                      />
                    </div>
                  </div>
                )}
                {(selectedSection === 'all' || selectedSection === 'ayt') && (
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          AYT
                        </div>
                        <span className="font-semibold text-purple-800">AYT</span>
                      </div>
                      <span className="text-sm text-purple-600">
                        {Object.keys(filteredYKSTopics?.aytSubjects || {}).length} Ders
                      </span>
                    </div>
                    <div className="mt-2 w-full bg-purple-200 rounded-full h-1.5">
                      <div
                        className="bg-purple-500 h-1.5 rounded-full"
                        style={{
                          width: `100%`
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Ders Bazında İstatistikler */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(selectedSubject === 'all' ? subjects : [selectedSubject]).map((subject) => {
                const stats = getSubjectStats(subject);
                return (
                  <div
                    key={subject}
                    className={`p-3 rounded-lg border ${
                      selectedSubject === subject || selectedSubject === 'all'
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-gray-50 border-gray-100 opacity-50'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-700 truncate">{subject}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {stats.completed}/{stats.total} (%{stats.percentage})
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full ${
                          stats.percentage >= 80 ? 'bg-green-500' :
                          stats.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${stats.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TYT Konuları */}
          {isYKSStudent && (selectedSection === 'all' || selectedSection === 'tyt') && (
            <div className="space-y-4">
              {Object.keys(filteredYKSTopics?.tytSubjects || {}).map((subject) => {
                // Ders filtresi aktifse sadece seçili dersi göster
                if (selectedSubject !== 'all' && subject !== selectedSubject) {
                  return null;
                }

                const topics = filteredYKSTopics?.tytSubjects[subject] || [];
                const completedInSubject = completedTopics.filter(p => p.subject === subject);

                return (
                  <div key={subject} className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                    <div className="p-4 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-blue-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold">
                            {subject.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800">{subject}</h3>
                            <p className="text-sm text-gray-500">Temel Yeterlilik Testi</p>
                          </div>
                        </div>
                        <span className="text-sm text-blue-600 font-medium">
                          {completedInSubject.length} / {topics.length} tamamlandı
                        </span>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {topics.map((topic) => {
                          const isCompleted = getTopicCompletion(subject, topic);
                          const completion = completedTopics.find(
                            p => p.subject === subject && p.topic === topic
                          );

                          return (
                            <div
                              key={topic}
                              className={`flex items-start gap-2 p-3 rounded-lg border transition-colors ${
                                isCompleted
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <button
                                onClick={() => {
                                  if (!isCompleted) {
                                    markTopicCompleted(selectedStudentId, subject, topic);
                                  }
                                }}
                                className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                  isCompleted
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-gray-300 hover:border-green-400'
                                }`}
                              >
                                {isCompleted && <CheckCircle className="w-4 h-4" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${
                                  isCompleted ? 'text-green-700' : 'text-gray-700'
                                }`}>
                                  {topic}
                                </p>
                                {isCompleted && completion && (
                                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(completion.completedAt).toLocaleDateString('tr-TR')}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* AYT Konuları */}
          {isYKSStudent && (selectedSection === 'all' || selectedSection === 'ayt') && (
            <div className="space-y-4">
              {Object.keys(filteredYKSTopics?.aytSubjects || {}).map((subject) => {
                // Ders filtresi aktifse sadece seçili dersi göster
                if (selectedSubject !== 'all' && subject !== selectedSubject) {
                  return null;
                }

                const topics = filteredYKSTopics?.aytSubjects[subject] || [];
                const completedInSubject = completedTopics.filter(p => p.subject === subject);

                return (
                  <div key={subject} className="bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
                    <div className="p-4 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-purple-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center text-white font-bold">
                            {subject.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800">AYT - {subject}</h3>
                            <p className="text-sm text-gray-500">Alan Yeterlilik Testi</p>
                          </div>
                        </div>
                        <span className="text-sm text-purple-600 font-medium">
                          {completedInSubject.length} / {topics.length} tamamlandı
                        </span>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {topics.map((topic) => {
                          const isCompleted = getTopicCompletion(subject, topic);
                          const completion = completedTopics.find(
                            p => p.subject === subject && p.topic === topic
                          );

                          return (
                            <div
                              key={topic}
                              className={`flex items-start gap-2 p-3 rounded-lg border transition-colors ${
                                isCompleted
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <button
                                onClick={() => {
                                  if (!isCompleted) {
                                    markTopicCompleted(selectedStudentId, subject, topic);
                                  }
                                }}
                                className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                  isCompleted
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-gray-300 hover:border-green-400'
                                }`}
                              >
                                {isCompleted && <CheckCircle className="w-4 h-4" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${
                                  isCompleted ? 'text-green-700' : 'text-gray-700'
                                }`}>
                                  {topic}
                                </p>
                                {isCompleted && completion && (
                                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(completion.completedAt).toLocaleDateString('tr-TR')}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Normal Sınıf Konuları (9, 10, 11, 12) */}
          {!isYKSStudent && (
            <div className="space-y-4">
              {(selectedSubject === 'all' ? subjects : [selectedSubject]).map((subject) => {
                const topics = getTopicsForSubject(subject);
                const completedInSubject = getCompletedTopicsBySubject(selectedStudentId, subject);

                if (topics.length === 0) return null;

                return (
                  <div key={subject} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-slate-600" />
                          <h3 className="font-semibold text-slate-800">{subject}</h3>
                        </div>
                        <span className="text-sm text-gray-500">
                          {completedInSubject.length}/{topics.length} konu tamamlandı
                        </span>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {topics.map((topic) => {
                          const isCompleted = getTopicCompletion(subject, topic);
                          const completion = completedTopics.find(
                            p => p.subject === subject && p.topic === topic
                          );

                          return (
                            <div
                              key={topic}
                              className={`flex items-start gap-2 p-3 rounded-lg border transition-colors ${
                                isCompleted
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <button
                                onClick={() => {
                                  if (!isCompleted) {
                                    markTopicCompleted(selectedStudentId, subject, topic);
                                  }
                                }}
                                className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                  isCompleted
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-gray-300 hover:border-green-400'
                                }`}
                              >
                                {isCompleted && <CheckCircle className="w-4 h-4" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${
                                  isCompleted ? 'text-green-700' : 'text-gray-700'
                                }`}>
                                  {topic}
                                </p>
                                {isCompleted && completion && (
                                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(completion.completedAt).toLocaleDateString('tr-TR')}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Konu Bulunamadı */}
          {subjects.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Konu Bulunamadı</h3>
              <p className="text-gray-500">
                Bu sınıf için tanımlı konu bulunamadı veya arama kriterlerinize uygun konu yok.
              </p>
            </div>
          )}
        </>
      )}

      {/* Öğrenci Seçilmediğinde */}
      {!selectedStudentId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Öğrenci Seçin</h3>
          <p className="text-gray-500">
            Konu takibini görmek için bir öğrenci seçin.
          </p>
        </div>
      )}
    </div>
  );
}
