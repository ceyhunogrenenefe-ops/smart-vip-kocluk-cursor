import React from 'react';

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message + '\n' + error.stack;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
};

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: unknown }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-xl p-6">
          <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[#1a3fad]">Bir şeyler ters gitti</h2>
            <p className="mt-1 text-sm text-slate-600">
              Sayfa beklenmedik bir hatayla durdu. Yenileyip tekrar deneyin.
            </p>
            <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
              {serializeError(this.state.error)}
            </pre>
            <button
              type="button"
              className="mt-4 rounded-xl bg-[#1a3fad] px-4 py-2 text-sm font-bold text-white"
              onClick={() => window.location.reload()}
            >
              Sayfayı yenile
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
