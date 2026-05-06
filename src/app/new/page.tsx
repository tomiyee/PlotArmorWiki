import NewSerialForm from './NewSerialForm';

type Props = {
  searchParams: Promise<{ title?: string }>;
};

export default async function NewSerialPage({ searchParams }: Props) {
  const { title } = await searchParams;
  return <NewSerialForm defaultTitle={title} />;
}
