import { STAFF_ROLES, type StaffRole } from "@packages/access-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { useTranslation } from "react-i18next";
import { STAFF_ROLE_LABEL_KEYS } from "../team-labels";

export interface RoleSelectProps {
  value: StaffRole;
  onChange: (role: StaffRole) => void;
  label: string;
}

export function RoleSelect({ value, onChange, label }: RoleSelectProps) {
  const { t } = useTranslation("admin");

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const role = STAFF_ROLES.find((candidate) => candidate === next);
        if (role) onChange(role);
      }}
    >
      <SelectTrigger aria-label={label} className="w-full sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAFF_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {t(STAFF_ROLE_LABEL_KEYS[role])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
