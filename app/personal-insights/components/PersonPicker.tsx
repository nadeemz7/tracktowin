"use client";

import type { ChangeEvent } from "react";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type PersonOption = {
  id: string;
  fullName: string;
};

type Props = {
  people: PersonOption[];
  selectedPersonId: string;
};

export default function PersonPicker({ people, selectedPersonId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [people]
  );

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) {
      params.set("personId", nextId);
    } else {
      params.delete("personId");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <select
      value={selectedPersonId}
      onChange={handleChange}
      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
    >
      {sortedPeople.map((person) => (
        <option key={person.id} value={person.id}>
          {person.fullName}
        </option>
      ))}
    </select>
  );
}
