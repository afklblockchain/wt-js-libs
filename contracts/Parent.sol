pragma solidity ^0.4.11;

/*
 * Parent
 * A contract that can have child contracts,
 * and allow functions only to be called by them.
 */
contract Parent {

  mapping(address => uint) public childsIndex;
  address[] public childs;

  function Parent() {
    childs.length ++;
  }

  modifier onlyChild() {
    if (childsIndex[msg.sender] == 0) {
      throw;
    }
    _;
  }

  function addChild(address _child) internal {
    childsIndex[_child] = childs.length;
    childs.push(_child);
  }

  function removeChild(address _child) internal {
    delete childs[ childsIndex[_child] ];
    delete childsIndex[_child];
  }

  function getChildsLength() constant returns (uint) {
    return childs.length;
  }

}
