export default function NotFound() {
  return (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold font-mono text-primary">404</h1>
        <h2 className="text-xl font-semibold">Page not found</h2>
        <p className="text-muted-foreground max-w-sm mx-auto">
          The operation you are trying to access does not exist or has been moved.
        </p>
      </div>
    </div>
  );
}