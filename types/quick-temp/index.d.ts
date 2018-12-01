declare module 'quick-temp' {
  const quickTemp: {
    makeOrRemake(obj: object, prop: string, className?: string): void;
  };
  export default quickTemp;
}

