import type { Route } from "./+types/home";
import { VolunteerScheduler } from "../components/VolunteerScheduler";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Agendamento de voluntários" },
    {
      name: "description",
      content:
        "Informe nome, dias, turnos e funções para ver em qual dia você pode ser direcionado.",
    },
  ];
}

export default function Home() {
  return <VolunteerScheduler />;
}
