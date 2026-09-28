/* The reader profile's route, /psychics/:id/details: the page as it is
   (PsychicDetails.tsx), plus its head. Once the reader has loaded, the title and
   description carry the name the page's h1 shows; a reader who is gone
   (the API's 404, the page's "This reader is no longer here.") is kept out of
   search. While the reader loads, the head is left as it is. The query is the page's own
   (usePsychicDetails), so no second request is made. */
import { useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import Seo, { NoIndexSeo } from "../../../components/Seo";
import { readerSeo } from "../../../seo/seoData";
import { usePsychicDetails } from "../hooks/usePsychicDetails";
import PsychicDetails from "./PsychicDetails";

function ReaderSeo() {
  const { id } = useParams<{ id: string }>();
  const { data: psychic, error } = usePsychicDetails(id ? parseInt(id) : undefined);
  if (psychic) return <Seo meta={readerSeo(psychic.id, psychic.username)} />;
  if (isAxiosError(error) && error.response?.status === 404) return <NoIndexSeo />;
  return null;
}

export default function PsychicDetailsRoute() {
  return (
    <>
      <ReaderSeo />
      <PsychicDetails />
    </>
  );
}
