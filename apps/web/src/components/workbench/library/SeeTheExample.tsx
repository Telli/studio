import { Link } from "@tanstack/react-router";

import { Button } from "../../ui/button";

/**
 * See the example, as New and the library both offer it: opens the page of the example the file is
 * in (`/examples/$id`), view only, where Make a copy to edit makes a project of your own from it
 * and opens it on that file.
 */
export function SeeTheExample(props: {
  /** The example the file is in (`studio-sample/<id>`). */
  readonly sampleId: string;
  /** The example's file in it. */
  readonly file: string;
  readonly size: "xs" | "sm";
  /** Once the example's page is opening. */
  readonly onOpened?: () => void;
  readonly className?: string;
}) {
  return (
    <div className={props.className}>
      <Button
        variant="outline"
        size={props.size}
        render={
          <Link to="/examples/$id" params={{ id: props.sampleId }} search={{ file: props.file }} />
        }
        onClick={props.onOpened}
      >
        See the example
      </Button>
    </div>
  );
}
