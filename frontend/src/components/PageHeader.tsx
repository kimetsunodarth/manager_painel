import type { ReactNode } from 'react';

type PageHeaderProps = {
  badge?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export default function PageHeader({ badge, title, description, actions }: PageHeaderProps) {
  return (
    <div className="ananim-page-header">
      <div className="ananim-page-header-copy">
        {badge ? <span className="ananim-page-eyebrow">{badge}</span> : null}
        <div className="space-y-2">
          <h1 className="ananim-page-title">{title}</h1>
          {description ? <p className="ananim-page-description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2 self-start md:self-end">{actions}</div> : null}
    </div>
  );
}
