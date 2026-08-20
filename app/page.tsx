import { cookies } from "next/headers";
import { currentUser } from "../lib/auth";
import { listResumes, seedResume } from "../lib/store";
import Workbench from "../components/Workbench";
import Login from "../components/Login";

export default async function Home() {
  const user = await currentUser((await cookies()).get("resume_user")?.value);
  if (!user) return <Login />;
  const resumes = await listResumes(user.id); const initial = resumes[0] || await seedResume(user.id);
  return <Workbench initial={initial} resumes={resumes.length ? resumes : [initial]} user={user.email} />;
}
