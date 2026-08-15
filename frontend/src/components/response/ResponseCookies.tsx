import React from 'react';
import { Cookie } from 'lucide-react';

interface ResponseCookiesProps {
  cookies: Record<string, string>;
}

export const ResponseCookies: React.FC<ResponseCookiesProps> = ({ cookies }) => {
  const cookieEntries = Object.entries(cookies);

  if (cookieEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-xs text-text-faint space-y-2 select-none">
        <Cookie className="w-7 h-7 opacity-40" />
        <span>No cookies returned by the server for this request.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto text-xs">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border-subtle bg-bg-card/60 text-text-muted font-medium sticky top-0 select-none">
            <th className="px-3 py-2 font-medium w-1/3 min-w-[140px]">Cookie Name</th>
            <th className="px-3 py-2 font-medium min-w-[200px]">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle font-mono text-[12px]">
          {cookieEntries.map(([k, v]) => (
            <tr key={k} className="hover:bg-bg-card/40 transition-colors">
              <td className="px-3 py-2 text-text-secondary font-medium select-all break-all">{k}</td>
              <td className="px-3 py-2 text-text-primary break-all select-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
