/** The forms of a message that depends on a count, named after the Unicode plural categories. */
export interface PluralMessage {
  /** Used for a count of exactly zero, whatever the language's plural rules say. */
  readonly none?: string;
  readonly zero?: string;
  readonly one: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

export type Message = string | PluralMessage;
export type MessageCatalog = Readonly<Record<string, Message>>;

export type ParamValue = string | number;

type PlaceholderNames<Text extends string> = Text extends `${string}{${infer Name}}${infer Rest}` ? Name | PlaceholderNames<Rest> : never;

type TextParams<Text extends string> = [PlaceholderNames<Text>] extends [never]
  ? Record<never, never>
  : { readonly [Name in PlaceholderNames<Text>]: ParamValue };

type PluralParams<Forms extends PluralMessage> = { readonly count: number } & TextParams<Forms['other']>;

/** The values a message needs: its `{placeholders}`, plus `count` for a plural message. */
export type MessageParams<Entry extends Message> = Entry extends string
  ? TextParams<Entry>
  : Entry extends PluralMessage
    ? PluralParams<Entry>
    : never;

export type TranslateArguments<Entry extends Message> = Entry extends Message
  ? keyof MessageParams<Entry> extends never
    ? []
    : [params: MessageParams<Entry>]
  : never;

/** A catalog fragment must declare exactly the keys of its English twin. */
export type TwinOf<English extends MessageCatalog> = { readonly [Key in keyof English]: Message };
