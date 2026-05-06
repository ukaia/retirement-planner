type Props = {
  title: string;
  description?: string;
};

export function SectionStub({ title, description }: Props) {
  return (
    <section>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted max-w-prose">{description}</p>
        ) : null}
      </header>
      <div className="card">
        <p className="text-sm text-muted">
          This section is under construction. Content will appear here as the
          calculation engine and inputs are wired up.
        </p>
      </div>
    </section>
  );
}
