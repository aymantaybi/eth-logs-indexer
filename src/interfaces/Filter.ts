import EventJsonInterface from "./EventJsonInterface";
import FunctionJsonInterface from "./FunctionJsonInterface";


interface Filter {
  address: string;
  jsonInterface: {
    event: EventJsonInterface;
    function?: FunctionJsonInterface;
  };
}

export default Filter;