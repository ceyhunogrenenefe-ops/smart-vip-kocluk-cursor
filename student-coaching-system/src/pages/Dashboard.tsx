// Türkçe: Ana Panel (Dashboard) Sayfası
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  GraduationCap,
  Users,
  TrendingUp,
  Target,
  CheckCircle,
  XCircle,
  Clock,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  BookOpen,
  BarChart3,
  MessageCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { CLASS_LEVELS, formatClassLevelLabel } from '../types';

export default function Dashboard() {
  const { students, coaches, weeklyEntries, getStudentStats, institution } = useApp();
  const navigate = useNavigate();

  // Genel istatistikler
  const totalStats = {
    students: students.length,
    coaches: coaches.length,
    entries: weeklyEntries.length,
  };

  // Haftalık toplam istatistikler
  const weeklyStats = weeklyEntries.reduce(
    (acc, entry) => ({
      totalTarget: acc.totalTarget + entry.targetQuestions,
      totalSolved: acc.totalSolved + entry.solvedQuestions,
      totalCorrect: acc.totalCorrect + entry.correctAnswers,
      totalWrong: acc.totalWrong + entry.wrongAnswers,
      totalBlank: acc.totalBlank + entry.blankAnswers,
    }),
    { totalTarget: 0, totalSolved: 0, totalCorrect: 0, totalWrong: 0, totalBlank: 0 }
  );

  const realizationRate = weeklyStats.totalTarget > 0
    ? Math.round((weeklyStats.totalSolved / weeklyStats.totalTarget) * 100)
    : 0;
  const successRate = weeklyStats.totalSolved > 0
    ? Math.round((weeklyStats.totalCorrect / weeklyStats.totalSolved) * 100)
    : 0;

  // Ders bazlı başarı verileri
  const subjectStats = weeklyEntries.reduce((acc, entry) => {
    if (!acc[entry.subject]) {
      acc[entry.subject] = { correct: 0, solved: 0 };
    }
    acc[entry.subject].correct += entry.correctAnswers;
    acc[entry.subject].solved += entry.solvedQuestions;
    return acc;
  }, {} as { [key: string]: { correct: number; solved: number } });

  const subjectChartData = Object.entries(subjectStats).map(([subject, stats]) => ({
    name: subject,
    başarı: stats.solved > 0 ? Math.round((stats.correct / stats.solved) * 100) : 0,
    çözülen: stats.solved,
  }));

  // Son 7 günlük performans
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const dailyPerformance = last7Days.map(date => {
    const dayEntries = weeklyEntries.filter(e => e.date === date);
    return {
      tarih: new Date(date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }),
      doğru: dayEntries.reduce((sum, e) => sum + e.correctAnswers, 0),
      yanlış: dayEntries.reduce((sum, e) => sum + e.wrongAnswers, 0),
    };
  });

  // Doğru/Yanlış dağılımı
  const pieData = [
    { name: 'Doğru', value: weeklyStats.totalCorrect, color: '#10B981' },
    { name: 'Yanlış', value: weeklyStats.totalWrong, color: '#EF4444' },
    { name: 'Boş', value: weeklyStats.totalBlank, color: '#6B7280' },
  ];

  // En başarılı öğrenciler
  const topStudents = students
    .map(student => ({
      ...student,
      stats: getStudentStats(student.id),
    }))
    .filter(s => s.stats.totalSolved > 0)
    .sort((a, b) => b.stats.successRate - a.stats.successRate)
    .slice(0, 5);

  // Sınıf bazlı dağılım
  const classDistribution = CLASS_LEVELS.map(({ value, label }) => ({
    sınıf: label,
    öğrenci: students.filter(s => s.classLevel === value).length,
  }));

  const statCards = [
    {
      title: 'Toplam Öğrenci',
      value: totalStats.students,
      icon: GraduationCap,
      color: 'from-blue-500 to-blue-600',
      trend: '+12%',
      trendUp: true,
      onClick: () => navigate('/students'),
    },
    {
      title: 'Toplam Öğretmen',
      value: totalStats.coaches,
      icon: Users,
      color: 'from-purple-500 to-purple-600',
      trend: '+3%',
      trendUp: true,
      onClick: () => navigate('/coaches'),
    },
    {
      title: 'Gerçekleşme Oranı',
      value: `%${realizationRate}`,
      icon: Target,
      color: 'from-orange-500 to-orange-600',
      trend: realizationRate >= 80 ? '+5%' : '-8%',
      trendUp: realizationRate >= 80,
    },
    {
      title: 'Başarı Oranı',
      value: `%${successRate}`,
      icon: Award,
      color: 'from-green-500 to-green-600',
      trend: successRate >= 70 ? '+3%' : '-5%',
      trendUp: successRate >= 70,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hoşgeldin Banner */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Hoş Geldiniz!</h2>
            <p className="text-slate-300">
              {institution.name} - Öğrenci Koçluk ve Takip Sistemi
            </p>
            <p className="text-sm text-slate-400 mt-2">
              {new Date().toLocaleDateString('tr-TR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={() => navigate('/tracking')}
              className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Haftalık Takip
            </button>
            <button
              onClick={() => navigate('/reports')}
              className="px-4 py-2 bg-red-500 rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Rapor Oluştur
            </button>
          </div>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              onClick={card.onClick}
              className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 cursor-pointer hover:shadow-md transition-shadow ${
                card.onClick ? '' : 'cursor-default'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  card.trendUp ? 'text-green-600' : 'text-red-600'
                }`}>
                  {card.trendUp ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  {card.trend}
                </div>
              </div>
              <h3 className="text-3xl font-bold text-slate-800">{card.value}</h3>
              <p className="text-gray-500 text-sm mt-1">{card.title}</p>
            </div>
          );
        })}
      </div>

      {/* Hızlı İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{weeklyStats.totalCorrect}</p>
              <p className="text-sm text-gray-500">Doğru Sayısı</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{weeklyStats.totalWrong}</p>
              <p className="text-sm text-gray-500">Yanlış Sayısı</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{weeklyStats.totalBlank}</p>
              <p className="text-sm text-gray-500">Boş Sayısı</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{weeklyStats.totalSolved}/{weeklyStats.totalTarget}</p>
              <p className="text-sm text-gray-500">Hedef/Çözülen</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grafikler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ders Bazlı Başarı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Ders Bazlı Başarı (%)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="başarı" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Günlük Performans */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Günlük Performans</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="tarih" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="doğru" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981' }} />
                <Line type="monotone" dataKey="yanlış" stroke="#EF4444" strokeWidth={2} dot={{ fill: '#EF4444' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-600">Doğru</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-sm text-gray-600">Yanlış</span>
            </div>
          </div>
        </div>

        {/* Doğru/Yanlış Dağılımı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Doğru/Yanlış/Boş Dağılımı</h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 mt-2">
            {pieData.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-sm text-gray-600">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sınıf Bazlı Dağılım */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Sınıf Bazlı Öğrenci Dağılımı</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="sınıf" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="öğrenci" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* En Başarılı Öğrenciler */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">En Başarılı Öğrenciler</h3>
          <button
            onClick={() => navigate('/students')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Tümünü Görüntüle →
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {topStudents.map((student, index) => (
            <div
              key={student.id}
              className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/students/${student.id}`)}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-600' : 'bg-blue-500'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{student.name}</p>
                  <p className="text-xs text-gray-500">{formatClassLevelLabel(student.classLevel)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-slate-800">%{student.stats.successRate}</span>
                <span className="text-xs text-gray-500">
                  {student.stats.totalSolved}/{student.stats.totalTarget} soru
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hızlı İşlemler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/students')}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-blue-600" />
          </div>
          <span className="font-medium text-slate-800">Öğrenci Ekle</span>
        </button>
        <button
          onClick={() => navigate('/coaches')}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <span className="font-medium text-slate-800">Öğretmen Ekle</span>
        </button>
        <button
          onClick={() => navigate('/tracking')}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-green-600" />
          </div>
          <span className="font-medium text-slate-800">Kayıt Gir</span>
        </button>
        <button
          onClick={() => navigate('/whatsapp')}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="font-medium text-slate-800">WhatsApp</span>
        </button>
      </div>
    </div>
  );
}
